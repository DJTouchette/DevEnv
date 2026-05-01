import {
  Cause,
  Duration,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  Scope,
  Stream,
} from "effect";
import { RpcClient } from "effect/unstable/rpc";

import { ClientTracingLive } from "../observability/clientTracing";
import { clearAllTrackedRpcRequests } from "./requestLatencyState";
import {
  createWsRpcProtocolLayer,
  makeWsRpcProtocolClient,
  type WsProtocolLifecycleHandlers,
  type WsRpcProtocolClient,
  type WsRpcProtocolSocketUrlProvider,
} from "./protocol";
import { isTransportConnectionErrorMessage } from "./transportError";

interface SubscribeOptions {
  readonly retryDelay?: Duration.Input;
  readonly onResubscribe?: () => void;
  // Called once when the subscription loop terminates due to an
  // application-level (non-transport) error. The transport itself does not
  // retry these — callers that own a longer-lived subscription concept (e.g.
  // a thread detail subscription) can use this to schedule a re-attach.
  readonly onFailed?: (error: string) => void;
}

interface RequestOptions {
  readonly timeout?: Option.Option<Duration.Input>;
}

const DEFAULT_SUBSCRIPTION_RETRY_DELAY_MS = Duration.millis(250);
const NOOP: () => void = () => undefined;

interface TransportSession {
  readonly clientPromise: Promise<WsRpcProtocolClient>;
  readonly clientScope: Scope.Closeable;
  readonly runtime: ManagedRuntime.ManagedRuntime<RpcClient.Protocol, never>;
  closed: boolean;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error);
}

export class WsTransport {
  private readonly url: WsRpcProtocolSocketUrlProvider;
  private readonly lifecycleHandlers: WsProtocolLifecycleHandlers | undefined;
  private disposed = false;
  private hasReportedTransportDisconnect = false;
  private reconnectChain: Promise<void> = Promise.resolve();
  private nextSessionId = 0;
  private activeSessionId = 0;
  private session: TransportSession;
  private paused = false;
  private resumeWaiters: Array<() => void> = [];

  constructor(
    url: WsRpcProtocolSocketUrlProvider,
    lifecycleHandlers?: WsProtocolLifecycleHandlers,
  ) {
    this.url = url;
    this.lifecycleHandlers = lifecycleHandlers;
    this.session = this.createSession();
  }

  // Block while the transport is paused (typically: the browser tab is
  // hidden). The current session is closed during pause; we only return once
  // resume() has installed a fresh one. Resolves immediately when not paused.
  private waitForResume(): Promise<void> {
    if (!this.paused) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.resumeWaiters.push(resolve);
    });
  }

  async request<TSuccess>(
    execute: (client: WsRpcProtocolClient) => Effect.Effect<TSuccess, Error, never>,
    _options?: RequestOptions,
  ): Promise<TSuccess> {
    if (this.disposed) {
      throw new Error("Transport disposed");
    }

    await this.waitForResume();
    if (this.disposed) {
      throw new Error("Transport disposed");
    }

    const session = this.session;
    const client = await session.clientPromise;
    return await session.runtime.runPromise(Effect.suspend(() => execute(client)));
  }

  async requestStream<TValue>(
    connect: (client: WsRpcProtocolClient) => Stream.Stream<TValue, Error, never>,
    listener: (value: TValue) => void,
  ): Promise<void> {
    if (this.disposed) {
      throw new Error("Transport disposed");
    }

    await this.waitForResume();
    if (this.disposed) {
      throw new Error("Transport disposed");
    }

    const session = this.session;
    const client = await session.clientPromise;
    await session.runtime.runPromise(
      Stream.runForEach(connect(client), (value) =>
        Effect.sync(() => {
          try {
            listener(value);
          } catch {
            // Swallow listener errors so the stream can finish cleanly.
          }
        }),
      ),
    );
  }

  subscribe<TValue>(
    connect: (client: WsRpcProtocolClient) => Stream.Stream<TValue, Error, never>,
    listener: (value: TValue) => void,
    options?: SubscribeOptions,
  ): () => void {
    if (this.disposed) {
      return () => undefined;
    }

    let active = true;
    let hasReceivedValue = false;
    const retryDelayMs = Duration.toMillis(
      Duration.fromInputUnsafe(options?.retryDelay ?? DEFAULT_SUBSCRIPTION_RETRY_DELAY_MS),
    );
    let cancelCurrentStream: () => void = NOOP;

    void (async () => {
      for (;;) {
        if (!active || this.disposed) {
          return;
        }

        await this.waitForResume();
        if (!active || this.disposed) {
          return;
        }

        const session = this.session;
        try {
          if (hasReceivedValue) {
            try {
              options?.onResubscribe?.();
            } catch {
              // Swallow reconnect hook errors so the stream can recover.
            }
          }

          const runningStream = this.runStreamOnSession(
            session,
            connect,
            listener,
            () => active,
            () => {
              this.hasReportedTransportDisconnect = false;
              hasReceivedValue = true;
            },
          );
          cancelCurrentStream = runningStream.cancel;
          await runningStream.completed;
          cancelCurrentStream = NOOP;
        } catch (error) {
          cancelCurrentStream = NOOP;
          if (!active || this.disposed) {
            return;
          }

          // If pause() interrupted the stream, treat it like a session
          // change: re-iterate so the loop blocks at waitForResume() instead
          // of bubbling up as an application-level failure.
          if (this.paused) {
            continue;
          }

          if (session !== this.session) {
            continue;
          }

          const formattedError = formatErrorMessage(error);
          if (!isTransportConnectionErrorMessage(formattedError)) {
            console.warn("WebSocket RPC subscription failed", {
              error: formattedError,
            });
            try {
              options?.onFailed?.(formattedError);
            } catch {
              // Swallow caller errors so we still terminate cleanly.
            }
            return;
          }

          if (!this.hasReportedTransportDisconnect) {
            console.warn("WebSocket RPC subscription disconnected", {
              error: formattedError,
            });
          }
          this.hasReportedTransportDisconnect = true;
          await sleep(retryDelayMs);
        }
      }
    })();

    return () => {
      active = false;
      cancelCurrentStream();
    };
  }

  async reconnect() {
    if (this.disposed) {
      throw new Error("Transport disposed");
    }

    const reconnectOperation = this.reconnectChain.then(async () => {
      if (this.disposed) {
        throw new Error("Transport disposed");
      }

      clearAllTrackedRpcRequests();
      const previousSession = this.session;
      this.session = this.createSession();
      await this.closeSession(previousSession);
    });

    this.reconnectChain = reconnectOperation.catch(() => undefined);
    await reconnectOperation;
  }

  // Close the current socket and stall further work until resume(). Used when
  // the browser tab becomes hidden — there's no point fighting the 5s ping
  // cadence against background-tab timer throttling, so we go quiet and rely
  // on the server's snapshot replay to catch up on resume.
  async pause() {
    if (this.disposed || this.paused) {
      return;
    }

    const pauseOperation = this.reconnectChain.then(async () => {
      if (this.disposed || this.paused) {
        return;
      }
      this.paused = true;
      clearAllTrackedRpcRequests();
      // Leave this.session pointing at the about-to-close session. Anyone
      // currently inside an `await session.clientPromise` will see the runtime
      // tear down and reject; the subscribe loop catches that and waits at
      // its next iteration's waitForResume() barrier.
      await this.closeSession(this.session);
    });

    this.reconnectChain = pauseOperation.catch(() => undefined);
    await pauseOperation;
  }

  async resume() {
    if (this.disposed || !this.paused) {
      return;
    }

    const resumeOperation = this.reconnectChain.then(async () => {
      if (this.disposed || !this.paused) {
        return;
      }
      // Replace the closed session with a fresh one before flipping the flag,
      // so waiters that wake up immediately find a usable session.
      this.session = this.createSession();
      this.paused = false;
      const waiters = this.resumeWaiters;
      this.resumeWaiters = [];
      for (const wake of waiters) {
        wake();
      }
    });

    this.reconnectChain = resumeOperation.catch(() => undefined);
    await resumeOperation;
  }

  async dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    // Wake any pause-blocked callers so they can observe `disposed` and bail.
    const waiters = this.resumeWaiters ?? [];
    this.resumeWaiters = [];
    for (const wake of waiters) {
      wake();
    }
    await this.closeSession(this.session);
  }

  private async closeSession(session: TransportSession) {
    if (session.closed) {
      return;
    }
    session.closed = true;
    try {
      await session.runtime.runPromise(Scope.close(session.clientScope, Exit.void));
    } catch {
      // The runtime may already be torn down; swallowing here keeps callers
      // (dispose/pause/reconnect) from leaking unhandled rejections.
    } finally {
      session.runtime.dispose();
    }
  }

  private createSession(): TransportSession {
    const sessionId = this.nextSessionId + 1;
    this.nextSessionId = sessionId;
    this.activeSessionId = sessionId;
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        createWsRpcProtocolLayer(this.url, {
          ...this.lifecycleHandlers,
          isActive: () => !this.disposed && this.activeSessionId === sessionId,
        }),
        ClientTracingLive,
      ),
    );
    const clientScope = runtime.runSync(Scope.make());
    const clientPromise = runtime.runPromise(
      Scope.provide(clientScope)(makeWsRpcProtocolClient),
    );
    // Attach a default rejection handler so callers that haven't awaited the
    // promise yet (e.g. a session closed before any request fired) don't
    // surface as unhandled rejections. Real consumers attach their own
    // handlers via `await`.
    clientPromise.catch(() => undefined);
    return {
      runtime,
      clientScope,
      clientPromise,
      closed: false,
    };
  }

  private runStreamOnSession<TValue>(
    session: TransportSession,
    connect: (client: WsRpcProtocolClient) => Stream.Stream<TValue, Error, never>,
    listener: (value: TValue) => void,
    isActive: () => boolean,
    markValueReceived: () => void,
  ): {
    readonly cancel: () => void;
    readonly completed: Promise<void>;
  } {
    let resolveCompleted!: () => void;
    let rejectCompleted!: (error: unknown) => void;
    const completed = new Promise<void>((resolve, reject) => {
      resolveCompleted = resolve;
      rejectCompleted = reject;
    });
    const cancel = session.runtime.runCallback(
      Effect.promise(() => session.clientPromise).pipe(
        Effect.flatMap((client) =>
          Stream.runForEach(connect(client), (value) =>
            Effect.sync(() => {
              if (!isActive()) {
                return;
              }

              markValueReceived();
              try {
                listener(value);
              } catch {
                // Swallow listener errors so the stream stays live.
              }
            }),
          ),
        ),
      ),
      {
        onExit: (exit) => {
          if (Exit.isSuccess(exit)) {
            resolveCompleted();
            return;
          }

          rejectCompleted(Cause.squash(exit.cause));
        },
      },
    );

    return {
      cancel,
      completed,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
