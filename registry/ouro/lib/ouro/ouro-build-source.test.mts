import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Plugin } from "vite";
import { ouroBuildSource } from "./ouro-build-source.ts";

/** `configureServer` always takes the plain function form here, never vite's `{ handler, order }` object form. */
function configure(plugin: Plugin, server: unknown): void {
  (plugin.configureServer as (server: unknown) => void)(server);
}

// A Vite plugin's configureServer and middleware are Node-only (this file shells out to real
// git, as the plugin does), so this runs under node --test, like Ouro AX's own .test.mts files,
// rather than Vitest's browser projects, which cannot load node:child_process.

function git(cwd: string, ...args: string[]) {
  execFileSync("git", args, { cwd });
}

/** A scratch git checkout with one commit, so the plugin has real git state to read. */
function scratchRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "ouro-build-source-"));
  git(dir, "init", "--quiet", "--initial-branch=main");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  writeFileSync(join(dir, "a.txt"), "a");
  git(dir, "add", "a.txt");
  git(dir, "commit", "--quiet", "-m", "first");
  return dir;
}

/** A fake Vite dev server: enough of `configureServer`'s argument for the plugin to register on. */
function fakeServer() {
  const watcherHandlers: Array<(file: string) => void> = [];
  let middleware: ((req: { url?: string }, res: { setHeader(name: string, value: string): void; end(body: string): void }, next: () => void) => void) | undefined;
  return {
    watcher: { on: (_event: string, handler: (file: string) => void) => watcherHandlers.push(handler) },
    middlewares: { use: (handler: typeof middleware) => (middleware = handler) },
    changeGit: () => watcherHandlers.forEach((handler) => handler("/repo/.git/HEAD")),
    request: (url: string | undefined) =>
      new Promise<{ status: number; body?: string }>((resolve) => {
        let body: string | undefined;
        middleware!(
          url === undefined ? {} : { url },
          { setHeader: () => undefined, end: (text: string) => (body = text) },
          () => resolve({ status: 404 }),
        );
        if (body !== undefined) resolve({ status: 200, body });
      }),
  };
}

test("serves the checkout's git state as JSON at __ouro/source, and passes other routes through", async () => {
  const dir = scratchRepo();
  try {
    const plugin = ouroBuildSource({ app: "demo", cwd: dir, official: "main", serviceFiles: ["/sw.js"] });
    const server = fakeServer();
    configure(plugin, server);
    const miss = await server.request("/other");
    assert.equal(miss.status, 404);
    const noUrl = await server.request(undefined);
    assert.equal(noUrl.status, 404, "a request with no url (such as CONNECT) passes through");
    const hit = await server.request("/base/__ouro/source");
    assert.equal(hit.status, 200);
    const withQuery = await server.request("/base/__ouro/source?t=1");
    assert.equal(withQuery.status, 200, "a cache-busting query string still matches the route");
    const info = JSON.parse(hit.body!);
    assert.equal(info.app, "demo");
    assert.equal(info.branch, "main");
    assert.equal(info.worktree, dir.split("/").pop());
    assert.match(info.sha, /^[0-9a-f]{40}$/);
    assert.equal(info.dirty, false);
    assert.equal(info.behind, 0);
    assert.deepEqual(info.serviceFiles, ["/sw.js"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("falls back to the current directory and the main branch when not given", async () => {
  const plugin = ouroBuildSource({ app: "demo" });
  const server = fakeServer();
  configure(plugin, server);
  const info = JSON.parse((await server.request("/__ouro/source")).body!);
  assert.equal(info.app, "demo");
  assert.equal(typeof info.branch, "string");
  assert.match(info.sha, /^[0-9a-f]{40}$/);
});

test("caches the response, and refreshes it once a .git file changes", async () => {
  const dir = scratchRepo();
  try {
    const plugin = ouroBuildSource({ app: "demo", cwd: dir });
    const server = fakeServer();
    configure(plugin, server);
    const before = JSON.parse((await server.request("/__ouro/source")).body!);
    writeFileSync(join(dir, "b.txt"), "b");
    git(dir, "add", "b.txt");
    git(dir, "commit", "--quiet", "-m", "second");
    const stillCached = JSON.parse((await server.request("/__ouro/source")).body!);
    assert.equal(stillCached.sha, before.sha, "a change the watcher never saw keeps the cache");
    server.changeGit();
    const refreshed = JSON.parse((await server.request("/__ouro/source")).body!);
    assert.notEqual(refreshed.sha, before.sha);
    assert.equal(refreshed.dirty, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("counts commits behind an origin remote, and reads 0 with no remote at all", async () => {
  const official = scratchRepo();
  const dir = mkdtempSync(join(tmpdir(), "ouro-build-source-clone-"));
  try {
    git(process.cwd(), "clone", "--quiet", official, dir);
    writeFileSync(join(official, "c.txt"), "c");
    git(official, "add", "c.txt");
    git(official, "commit", "--quiet", "-m", "third");
    git(dir, "fetch", "--quiet", "origin");
    const plugin = ouroBuildSource({ app: "demo", cwd: dir });
    const server = fakeServer();
    configure(plugin, server);
    const info = JSON.parse((await server.request("/__ouro/source")).body!);
    assert.equal(info.behind, 1);

    const noRemote = ouroBuildSource({ app: "demo", cwd: official });
    const noRemoteServer = fakeServer();
    configure(noRemote, noRemoteServer);
    const soloInfo = JSON.parse((await noRemoteServer.request("/__ouro/source")).body!);
    assert.equal(soloInfo.behind, 0);
  } finally {
    rmSync(official, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});
