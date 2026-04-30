/**
 * JiraThreadLinks - Sidecar map of thread → Jira issue associations.
 *
 * Persists `${stateDir}/jira-thread-links.json` so a thread can be deep-linked
 * to a Jira issue without expanding the orchestration domain. Atomic writes,
 * PubSub change stream, in-memory cache.
 *
 * @module JiraThreadLinks
 */
import {
  type JiraIssueKey,
  JiraStorageError,
  JiraThreadLink as JiraThreadLinkSchema,
  type JiraThreadLinkChange,
  ThreadId,
} from "@t3tools/contracts";

type JiraThreadLink = typeof JiraThreadLinkSchema.Type;
import {
  Context,
  Effect,
  FileSystem,
  HashMap,
  Layer,
  Option,
  Path,
  PubSub,
  Ref,
  Schema,
  Stream,
} from "effect";

import { ServerConfig } from "../../config.ts";
import { writeFileStringAtomically } from "../../atomicWrite.ts";
import { JiraCredentials } from "./JiraCredentials.ts";

export interface JiraThreadLinksShape {
  readonly link: (input: {
    readonly threadId: ThreadId;
    readonly issueKey: JiraIssueKey;
  }) => Effect.Effect<JiraThreadLink, JiraStorageError>;
  readonly unlink: (threadId: ThreadId) => Effect.Effect<void, JiraStorageError>;
  readonly get: (threadId: ThreadId) => Effect.Effect<Option.Option<JiraThreadLink>, JiraStorageError>;
  readonly list: Effect.Effect<ReadonlyArray<JiraThreadLink>, JiraStorageError>;
  readonly streamChanges: Stream.Stream<JiraThreadLinkChange>;
}

export class JiraThreadLinks extends Context.Service<JiraThreadLinks, JiraThreadLinksShape>()(
  "t3/jira/Services/JiraThreadLinks",
) {}

const LINKS_FILENAME = "jira-thread-links.json";

const StoredLinks = Schema.Record(Schema.String, JiraThreadLinkSchema);

const decodeLinks = Schema.decodeUnknownEffect(StoredLinks);

export const makeJiraThreadLinks = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig;
  const credentials = yield* JiraCredentials;
  const filePath = path.join(config.stateDir, LINKS_FILENAME);
  const cacheRef = yield* Ref.make<{
    readonly loaded: boolean;
    readonly value: HashMap.HashMap<ThreadId, JiraThreadLink>;
  }>({ loaded: false, value: HashMap.empty() });
  const changes = yield* PubSub.unbounded<JiraThreadLinkChange>();

  const readFromDisk = Effect.gen(function* () {
    const exists = yield* fs.exists(filePath).pipe(
      Effect.mapError(
        (cause) =>
          new JiraStorageError({
            detail: `Failed to access ${filePath}`,
            cause,
          }),
      ),
    );
    if (!exists) {
      return HashMap.empty<ThreadId, JiraThreadLink>();
    }
    const raw = yield* fs.readFileString(filePath).pipe(
      Effect.mapError(
        (cause) =>
          new JiraStorageError({
            detail: `Failed to read ${filePath}`,
            cause,
          }),
      ),
    );
    const parsed = yield* Effect.try({
      try: () => JSON.parse(raw) as unknown,
      catch: (cause) =>
        new JiraStorageError({
          detail: `Failed to parse ${filePath} as JSON`,
          cause,
        }),
    });
    const decoded = yield* decodeLinks(parsed).pipe(
      Effect.mapError(
        (cause) =>
          new JiraStorageError({
            detail: `Stored Jira thread links at ${filePath} are malformed`,
            cause,
          }),
      ),
    );
    let map = HashMap.empty<ThreadId, JiraThreadLink>();
    for (const [threadId, link] of Object.entries(decoded) as ReadonlyArray<
      readonly [string, JiraThreadLink]
    >) {
      map = HashMap.set(map, ThreadId.make(threadId), link);
    }
    return map;
  });

  const ensureLoaded = Effect.gen(function* () {
    const cached = yield* Ref.get(cacheRef);
    if (cached.loaded) return cached.value;
    const fresh = yield* readFromDisk;
    yield* Ref.set(cacheRef, { loaded: true, value: fresh });
    return fresh;
  });

  const writeToDisk = (links: HashMap.HashMap<ThreadId, JiraThreadLink>) => {
    const record: Record<string, JiraThreadLink> = {};
    for (const [threadId, link] of HashMap.entries(links)) {
      record[threadId] = link;
    }
    return writeFileStringAtomically({
      filePath,
      contents: `${JSON.stringify(record, null, 2)}\n`,
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.mapError(
        (cause) =>
          new JiraStorageError({
            detail: `Failed to persist Jira thread links to ${filePath}`,
            cause,
          }),
      ),
    );
  };

  const link: JiraThreadLinksShape["link"] = ({ threadId, issueKey }) =>
    Effect.gen(function* () {
      const creds = yield* credentials.get;
      const baseUrl = Option.match(creds, {
        onNone: () => "",
        onSome: (value) => value.baseUrl,
      });
      if (baseUrl.length === 0) {
        return yield* new JiraStorageError({
          detail: "Cannot link a thread to a Jira issue before configuring credentials.",
        });
      }
      const current = yield* ensureLoaded;
      const newLink: JiraThreadLink = {
        threadId,
        issueKey,
        baseUrl,
        linkedAt: new Date().toISOString(),
      };
      const next = HashMap.set(current, threadId, newLink);
      yield* writeToDisk(next);
      yield* Ref.set(cacheRef, { loaded: true, value: next });
      yield* PubSub.publish(changes, { type: "linked", link: newLink });
      return newLink;
    });

  const unlink: JiraThreadLinksShape["unlink"] = (threadId) =>
    Effect.gen(function* () {
      const current = yield* ensureLoaded;
      if (!HashMap.has(current, threadId)) return;
      const next = HashMap.remove(current, threadId);
      yield* writeToDisk(next);
      yield* Ref.set(cacheRef, { loaded: true, value: next });
      yield* PubSub.publish(changes, { type: "unlinked", threadId });
    });

  const get: JiraThreadLinksShape["get"] = (threadId) =>
    ensureLoaded.pipe(Effect.map((map) => HashMap.get(map, threadId)));

  const list: JiraThreadLinksShape["list"] = ensureLoaded.pipe(
    Effect.map((map) => Array.from(HashMap.values(map))),
  );

  return {
    link,
    unlink,
    get,
    list,
    get streamChanges() {
      return Stream.fromPubSub(changes);
    },
  } satisfies JiraThreadLinksShape;
});

export const JiraThreadLinksLive = Layer.effect(JiraThreadLinks, makeJiraThreadLinks);
