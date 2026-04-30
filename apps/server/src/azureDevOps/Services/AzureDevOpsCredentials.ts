/**
 * AzureDevOpsCredentials - On-disk credential store for the Azure DevOps integration.
 *
 * Persists `${secretsDir}/azure-devops.json` (chmod 0600) with the org URL,
 * PAT, and the list of project IDs the pipelines panel watches. Reads on
 * first access, caches in a Ref, broadcasts change events via PubSub for the
 * WS subscription layer.
 *
 * @module AzureDevOpsCredentials
 */
import {
  AdoCredentials as AdoCredentialsSchema,
  type AdoCredentialsSnapshot,
  type AdoProjectId,
  AdoProjectId as AdoProjectIdSchema,
  AdoStorageError,
} from "@t3tools/contracts";
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

const StoredCredentials = Schema.Struct({
  orgUrl: AdoCredentialsSchema.fields.orgUrl,
  pat: AdoCredentialsSchema.fields.pat,
  watchedProjectIds: Schema.optional(Schema.Array(AdoProjectIdSchema)),
});
type StoredCredentialsValue = typeof StoredCredentials.Type;

type AdoCredentialsValue = typeof AdoCredentialsSchema.Type;

export interface AzureDevOpsCredentialsShape {
  readonly get: Effect.Effect<Option.Option<AdoCredentialsValue>, AdoStorageError>;
  readonly getStored: Effect.Effect<Option.Option<StoredCredentialsValue>, AdoStorageError>;
  readonly snapshot: Effect.Effect<AdoCredentialsSnapshot, AdoStorageError>;
  readonly set: (
    creds: AdoCredentialsValue,
  ) => Effect.Effect<AdoCredentialsSnapshot, AdoStorageError>;
  readonly setWatchedProjects: (
    projectIds: ReadonlyArray<AdoProjectId>,
  ) => Effect.Effect<AdoCredentialsSnapshot, AdoStorageError>;
  readonly clear: Effect.Effect<AdoCredentialsSnapshot, AdoStorageError>;
  readonly streamChanges: Stream.Stream<Option.Option<StoredCredentialsValue>>;
}

export class AzureDevOpsCredentials extends Context.Service<
  AzureDevOpsCredentials,
  AzureDevOpsCredentialsShape
>()("t3/azureDevOps/Services/AzureDevOpsCredentials") {}

const CREDENTIALS_FILENAME = "azure-devops.json";

const toSnapshot = (creds: Option.Option<StoredCredentialsValue>): AdoCredentialsSnapshot =>
  Option.match(creds, {
    onNone: () => ({ configured: false }),
    onSome: (value) => ({
      configured: true,
      orgUrl: value.orgUrl,
      ...(value.watchedProjectIds !== undefined
        ? { watchedProjectIds: value.watchedProjectIds }
        : {}),
    }),
  });

const decodeStored = Schema.decodeUnknownEffect(StoredCredentials);

export const makeAzureDevOpsCredentials = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig;
  const secretsDir = config.secretsDir;
  const credsPath = path.join(secretsDir, CREDENTIALS_FILENAME);
  const cacheRef = yield* Ref.make<{
    readonly loaded: boolean;
    readonly value: Option.Option<StoredCredentialsValue>;
  }>({ loaded: false, value: Option.none() });
  const changes = yield* PubSub.unbounded<Option.Option<StoredCredentialsValue>>();

  const ensureSecretsDir = fs.makeDirectory(secretsDir, { recursive: true }).pipe(
    Effect.flatMap(() => fs.chmod(secretsDir, 0o700).pipe(Effect.ignore)),
    Effect.mapError(
      (cause) =>
        new AdoStorageError({
          detail: `Failed to prepare secrets directory ${secretsDir}.`,
          cause,
        }),
    ),
  );

  const readFromDisk = Effect.gen(function* () {
    const exists = yield* fs.exists(credsPath).pipe(
      Effect.mapError(
        (cause) =>
          new AdoStorageError({
            detail: `Failed to access ${credsPath}`,
            cause,
          }),
      ),
    );
    if (!exists) {
      return Option.none<StoredCredentialsValue>();
    }
    const raw = yield* fs.readFileString(credsPath).pipe(
      Effect.mapError(
        (cause) =>
          new AdoStorageError({
            detail: `Failed to read ${credsPath}`,
            cause,
          }),
      ),
    );
    const parsed = yield* Effect.try({
      try: () => JSON.parse(raw) as unknown,
      catch: (cause) =>
        new AdoStorageError({
          detail: `Failed to parse ${credsPath} as JSON`,
          cause,
        }),
    });
    const decoded = yield* decodeStored(parsed).pipe(
      Effect.mapError(
        (cause) =>
          new AdoStorageError({
            detail: `Stored Azure DevOps credentials at ${credsPath} are malformed`,
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

  const writeToDisk = (creds: StoredCredentialsValue) =>
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
          new AdoStorageError({
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
            new AdoStorageError({
              detail: `Failed to remove ${credsPath}`,
              cause,
            }),
          ),
    ),
  );

  const set: AzureDevOpsCredentialsShape["set"] = (creds) =>
    Effect.gen(function* () {
      const existing = yield* ensureLoaded;
      const merged: StoredCredentialsValue = {
        orgUrl: creds.orgUrl,
        pat: creds.pat,
        ...(Option.isSome(existing) && existing.value.watchedProjectIds !== undefined
          ? { watchedProjectIds: existing.value.watchedProjectIds }
          : {}),
      };
      yield* writeToDisk(merged);
      const next = Option.some(merged);
      yield* Ref.set(cacheRef, { loaded: true, value: next });
      yield* PubSub.publish(changes, next);
      return toSnapshot(next);
    });

  const setWatchedProjects: AzureDevOpsCredentialsShape["setWatchedProjects"] = (projectIds) =>
    Effect.gen(function* () {
      const existing = yield* ensureLoaded;
      if (Option.isNone(existing)) {
        return yield* new AdoStorageError({
          detail: "Cannot set watched projects before credentials are configured.",
        });
      }
      const merged: StoredCredentialsValue = {
        ...existing.value,
        watchedProjectIds: projectIds,
      };
      yield* writeToDisk(merged);
      const next = Option.some(merged);
      yield* Ref.set(cacheRef, { loaded: true, value: next });
      yield* PubSub.publish(changes, next);
      return toSnapshot(next);
    });

  const clear: AzureDevOpsCredentialsShape["clear"] = Effect.gen(function* () {
    yield* removeFromDisk;
    const next = Option.none<StoredCredentialsValue>();
    yield* Ref.set(cacheRef, { loaded: true, value: next });
    yield* PubSub.publish(changes, next);
    return toSnapshot(next);
  });

  return {
    get: ensureLoaded.pipe(
      Effect.map((value) =>
        Option.map(value, (stored) => ({ orgUrl: stored.orgUrl, pat: stored.pat })),
      ),
    ),
    getStored: ensureLoaded,
    snapshot: ensureLoaded.pipe(Effect.map(toSnapshot)),
    set,
    setWatchedProjects,
    clear,
    get streamChanges() {
      return Stream.fromPubSub(changes);
    },
  } satisfies AzureDevOpsCredentialsShape;
});

export const AzureDevOpsCredentialsLive = Layer.effect(
  AzureDevOpsCredentials,
  makeAzureDevOpsCredentials,
);
