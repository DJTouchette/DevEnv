/**
 * JiraCredentials - On-disk credential store for the Jira integration.
 *
 * Persists `${secretsDir}/jira.json` (chmod 0600) as a discriminated-union
 * credential record so both Basic (email + API token) and Bearer (API key)
 * flows are supported. Reads on first access, caches in a Ref, broadcasts
 * change events via PubSub for the WS subscription layer.
 *
 * @module JiraCredentials
 */
import {
  JiraCredentials as JiraCredentialsSchema,
  type JiraCredentialsSnapshot,
  JiraStorageError,
} from "@t3tools/contracts";

type JiraCredentialsValue = typeof JiraCredentialsSchema.Type;
import {
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  PubSub,
  Ref,
  Schema,
  Stream,
} from "effect";
import * as Crypto from "node:crypto";

import { ServerConfig } from "../../config.ts";

export interface JiraCredentialsShape {
  readonly get: Effect.Effect<Option.Option<JiraCredentialsValue>, JiraStorageError>;
  readonly snapshot: Effect.Effect<JiraCredentialsSnapshot, JiraStorageError>;
  readonly set: (
    creds: JiraCredentialsValue,
  ) => Effect.Effect<JiraCredentialsSnapshot, JiraStorageError>;
  readonly clear: Effect.Effect<JiraCredentialsSnapshot, JiraStorageError>;
  readonly streamChanges: Stream.Stream<Option.Option<JiraCredentialsValue>>;
}

export class JiraCredentials extends Context.Service<JiraCredentials, JiraCredentialsShape>()(
  "t3/jira/Services/JiraCredentials",
) {}

const CREDENTIALS_FILENAME = "jira.json";

const toSnapshot = (creds: Option.Option<JiraCredentialsValue>): JiraCredentialsSnapshot =>
  Option.match(creds, {
    onNone: () => ({ configured: false }),
    onSome: (value) =>
      value.kind === "basic"
        ? {
            configured: true,
            kind: "basic" as const,
            baseUrl: value.baseUrl,
            email: value.email,
          }
        : {
            configured: true,
            kind: "bearer" as const,
            baseUrl: value.baseUrl,
          },
  });

const decodeCredentials = Schema.decodeUnknownEffect(JiraCredentialsSchema);

export const makeJiraCredentials = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig;
  const secretsDir = config.secretsDir;
  const credsPath = path.join(secretsDir, CREDENTIALS_FILENAME);
  const cacheRef = yield* Ref.make<{
    readonly loaded: boolean;
    readonly value: Option.Option<JiraCredentialsValue>;
  }>({ loaded: false, value: Option.none() });
  const changes = yield* PubSub.unbounded<Option.Option<JiraCredentialsValue>>();

  const ensureSecretsDir = fs.makeDirectory(secretsDir, { recursive: true }).pipe(
    Effect.flatMap(() => fs.chmod(secretsDir, 0o700).pipe(Effect.ignore)),
    Effect.mapError(
      (cause) =>
        new JiraStorageError({
          detail: `Failed to prepare secrets directory ${secretsDir}.`,
          cause,
        }),
    ),
  );

  const readFromDisk = Effect.gen(function* () {
    const exists = yield* fs.exists(credsPath).pipe(
      Effect.mapError(
        (cause) =>
          new JiraStorageError({
            detail: `Failed to access ${credsPath}`,
            cause,
          }),
      ),
    );
    if (!exists) {
      return Option.none<JiraCredentialsValue>();
    }
    const raw = yield* fs.readFileString(credsPath).pipe(
      Effect.mapError(
        (cause) =>
          new JiraStorageError({
            detail: `Failed to read ${credsPath}`,
            cause,
          }),
      ),
    );
    const parsed = yield* Effect.try({
      try: () => JSON.parse(raw) as unknown,
      catch: (cause) =>
        new JiraStorageError({
          detail: `Failed to parse ${credsPath} as JSON`,
          cause,
        }),
    });
    const decoded = yield* decodeCredentials(parsed).pipe(
      Effect.mapError(
        (cause) =>
          new JiraStorageError({
            detail: `Stored Jira credentials at ${credsPath} are malformed`,
            cause,
          }),
      ),
    );
    return Option.some(decoded);
  });

  const ensureLoaded = Effect.gen(function* () {
    const cached = yield* Ref.get(cacheRef);
    if (cached.loaded) return cached.value;
    yield* ensureSecretsDir;
    const fresh = yield* readFromDisk;
    yield* Ref.set(cacheRef, { loaded: true, value: fresh });
    return fresh;
  });

  const writeToDisk = (creds: JiraCredentialsValue) =>
    Effect.gen(function* () {
      yield* ensureSecretsDir;
      const tempPath = `${credsPath}.${Crypto.randomUUID()}.tmp`;
      const contents = `${JSON.stringify(creds, null, 2)}\n`;
      yield* fs.writeFileString(tempPath, contents);
      yield* fs.chmod(tempPath, 0o600);
      yield* fs.rename(tempPath, credsPath);
      yield* fs.chmod(credsPath, 0o600);
    }).pipe(
      Effect.mapError(
        (cause) =>
          new JiraStorageError({
            detail: `Failed to persist credentials to ${credsPath}`,
            cause,
          }),
      ),
    );

  const removeFromDisk = fs.remove(credsPath).pipe(
    Effect.catch((cause) =>
      cause.reason._tag === "NotFound"
        ? Effect.void
        : Effect.fail(
            new JiraStorageError({
              detail: `Failed to remove ${credsPath}`,
              cause,
            }),
          ),
    ),
  );

  const set: JiraCredentialsShape["set"] = (creds) =>
    Effect.gen(function* () {
      yield* writeToDisk(creds);
      const next = Option.some(creds);
      yield* Ref.set(cacheRef, { loaded: true, value: next });
      yield* PubSub.publish(changes, next);
      return toSnapshot(next);
    });

  const clear: JiraCredentialsShape["clear"] = Effect.gen(function* () {
    yield* removeFromDisk;
    const next = Option.none<JiraCredentialsValue>();
    yield* Ref.set(cacheRef, { loaded: true, value: next });
    yield* PubSub.publish(changes, next);
    return toSnapshot(next);
  });

  return {
    get: ensureLoaded,
    snapshot: ensureLoaded.pipe(Effect.map(toSnapshot)),
    set,
    clear,
    get streamChanges() {
      return Stream.fromPubSub(changes);
    },
  } satisfies JiraCredentialsShape;
});

export const JiraCredentialsLive = Layer.effect(JiraCredentials, makeJiraCredentials);
