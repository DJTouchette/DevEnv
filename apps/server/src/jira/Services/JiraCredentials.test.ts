import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Option, Path } from "effect";

import { ServerConfig } from "../../config.ts";
import { JiraCredentials, JiraCredentialsLive } from "./JiraCredentials.ts";

const makeJiraCredentialsLayer = () =>
  JiraCredentialsLive.pipe(
    Layer.provideMerge(
      Layer.fresh(
        ServerConfig.layerTest(process.cwd(), { prefix: "t3code-jira-credentials-test-" }),
      ),
    ),
  );

it.layer(NodeServices.layer)("JiraCredentials", (it) => {
  it.effect("returns 'configured: false' when no credentials are stored", () =>
    Effect.gen(function* () {
      const credentials = yield* JiraCredentials;
      const snapshot = yield* credentials.snapshot;
      assert.deepEqual(snapshot, { configured: false });
    }).pipe(Effect.provide(makeJiraCredentialsLayer())),
  );

  it.effect("persists basic credentials with restrictive permissions", () =>
    Effect.gen(function* () {
      const credentials = yield* JiraCredentials;
      const config = yield* ServerConfig;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const stored = {
        kind: "basic" as const,
        baseUrl: "https://example.atlassian.net",
        email: "you@example.com",
        apiToken: "shhh",
      };
      const snapshot = yield* credentials.set(stored);
      assert.equal(snapshot.configured, true);
      assert.equal(snapshot.kind, "basic");
      assert.equal(snapshot.baseUrl, stored.baseUrl);
      assert.equal(snapshot.email, stored.email);

      const credsPath = path.join(config.secretsDir, "jira.json");
      const stat = yield* fs.stat(credsPath);
      const mode = stat.mode === undefined ? 0 : Number(stat.mode);
      assert.equal(mode & 0o777, 0o600);

      const reloaded = yield* credentials.get;
      assert.deepEqual(Option.getOrNull(reloaded), stored);
    }).pipe(Effect.provide(makeJiraCredentialsLayer())),
  );

  it.effect("clears credentials and removes the file", () =>
    Effect.gen(function* () {
      const credentials = yield* JiraCredentials;
      const config = yield* ServerConfig;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      yield* credentials.set({
        kind: "bearer",
        baseUrl: "https://example.atlassian.net",
        apiKey: "bearer-token",
      });
      yield* credentials.clear;
      const snapshot = yield* credentials.snapshot;
      assert.deepEqual(snapshot, { configured: false });
      const credsPath = path.join(config.secretsDir, "jira.json");
      const exists = yield* fs.exists(credsPath);
      assert.equal(exists, false);
    }).pipe(Effect.provide(makeJiraCredentialsLayer())),
  );

  it.effect("rejects malformed JSON on disk", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(config.secretsDir, { recursive: true });
      const credsPath = path.join(config.secretsDir, "jira.json");
      yield* fs.writeFileString(credsPath, "{ not json");

      const credentials = yield* JiraCredentials;
      const result = yield* credentials.snapshot.pipe(Effect.result);
      assert.equal(result._tag, "Failure");
    }).pipe(Effect.provide(makeJiraCredentialsLayer())),
  );
});
