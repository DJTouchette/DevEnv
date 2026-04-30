/**
 * AzureDevOpsThreadLinks - Sidecar map of thread → ADO pull request associations.
 *
 * Persists `${stateDir}/azure-devops-thread-links.json` so a thread can be
 * deep-linked to an ADO pull request without expanding the orchestration
 * domain. Atomic writes, PubSub change stream, in-memory cache.
 *
 * @module AzureDevOpsThreadLinks
 */
import {
  type AdoProjectId,
  type AdoRepositoryId,
  AdoStorageError,
  AdoPrThreadLink as AdoPrThreadLinkSchema,
  type AdoPrThreadLinkChange,
  ThreadId,
} from "@t3tools/contracts";
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

type AdoPrThreadLink = typeof AdoPrThreadLinkSchema.Type;

export interface AzureDevOpsThreadLinksShape {
  readonly link: (input: {
    readonly threadId: ThreadId;
    readonly projectId: AdoProjectId;
    readonly projectName: string;
    readonly repositoryId: AdoRepositoryId;
    readonly pullRequestId: number;
    readonly title: string;
    readonly url: string;
  }) => Effect.Effect<AdoPrThreadLink, AdoStorageError>;
  readonly unlink: (threadId: ThreadId) => Effect.Effect<void, AdoStorageError>;
  readonly get: (
    threadId: ThreadId,
  ) => Effect.Effect<Option.Option<AdoPrThreadLink>, AdoStorageError>;
  readonly list: Effect.Effect<ReadonlyArray<AdoPrThreadLink>, AdoStorageError>;
  readonly streamChanges: Stream.Stream<AdoPrThreadLinkChange>;
}

export class AzureDevOpsThreadLinks extends Context.Service<
  AzureDevOpsThreadLinks,
  AzureDevOpsThreadLinksShape
>()("t3/azureDevOps/Services/AzureDevOpsThreadLinks") {}

const LINKS_FILENAME = "azure-devops-thread-links.json";

const StoredLinks = Schema.Record(Schema.String, AdoPrThreadLinkSchema);

const decodeLinks = Schema.decodeUnknownEffect(StoredLinks);

export const makeAzureDevOpsThreadLinks = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig;
  const filePath = path.join(config.stateDir, LINKS_FILENAME);
  const cacheRef = yield* Ref.make<{
    readonly loaded: boolean;
    readonly value: HashMap.HashMap<ThreadId, AdoPrThreadLink>;
  }>({ loaded: false, value: HashMap.empty() });
  const changes = yield* PubSub.unbounded<AdoPrThreadLinkChange>();

  const readFromDisk = Effect.gen(function* () {
    const exists = yield* fs.exists(filePath).pipe(
      Effect.mapError(
        (cause) =>
          new AdoStorageError({
            detail: `Failed to access ${filePath}`,
            cause,
          }),
      ),
    );
    if (!exists) {
      return HashMap.empty<ThreadId, AdoPrThreadLink>();
    }
    const raw = yield* fs.readFileString(filePath).pipe(
      Effect.mapError(
        (cause) =>
          new AdoStorageError({
            detail: `Failed to read ${filePath}`,
            cause,
          }),
      ),
    );
    const parsed = yield* Effect.try({
      try: () => JSON.parse(raw) as unknown,
      catch: (cause) =>
        new AdoStorageError({
          detail: `Failed to parse ${filePath} as JSON`,
          cause,
        }),
    });
    const decoded = yield* decodeLinks(parsed).pipe(
      Effect.mapError(
        (cause) =>
          new AdoStorageError({
            detail: `Stored Azure DevOps thread links at ${filePath} are malformed`,
            cause,
          }),
      ),
    );
    let map = HashMap.empty<ThreadId, AdoPrThreadLink>();
    for (const [threadId, link] of Object.entries(decoded) as ReadonlyArray<
      readonly [string, AdoPrThreadLink]
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

  const writeToDisk = (links: HashMap.HashMap<ThreadId, AdoPrThreadLink>) => {
    const record: Record<string, AdoPrThreadLink> = {};
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
          new AdoStorageError({
            detail: `Failed to persist Azure DevOps thread links to ${filePath}`,
            cause,
          }),
      ),
    );
  };

  const link: AzureDevOpsThreadLinksShape["link"] = (input) =>
    Effect.gen(function* () {
      const current = yield* ensureLoaded;
      const newLink: AdoPrThreadLink = {
        threadId: input.threadId,
        projectId: input.projectId,
        projectName: input.projectName,
        repositoryId: input.repositoryId,
        pullRequestId: input.pullRequestId,
        title: input.title,
        url: input.url,
        linkedAt: new Date().toISOString(),
      };
      const next = HashMap.set(current, input.threadId, newLink);
      yield* writeToDisk(next);
      yield* Ref.set(cacheRef, { loaded: true, value: next });
      yield* PubSub.publish(changes, { type: "linked", link: newLink });
      return newLink;
    });

  const unlink: AzureDevOpsThreadLinksShape["unlink"] = (threadId) =>
    Effect.gen(function* () {
      const current = yield* ensureLoaded;
      if (!HashMap.has(current, threadId)) return;
      const next = HashMap.remove(current, threadId);
      yield* writeToDisk(next);
      yield* Ref.set(cacheRef, { loaded: true, value: next });
      yield* PubSub.publish(changes, { type: "unlinked", threadId });
    });

  const get: AzureDevOpsThreadLinksShape["get"] = (threadId) =>
    ensureLoaded.pipe(Effect.map((map) => HashMap.get(map, threadId)));

  const list: AzureDevOpsThreadLinksShape["list"] = ensureLoaded.pipe(
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
  } satisfies AzureDevOpsThreadLinksShape;
});

export const AzureDevOpsThreadLinksLive = Layer.effect(
  AzureDevOpsThreadLinks,
  makeAzureDevOpsThreadLinks,
);
