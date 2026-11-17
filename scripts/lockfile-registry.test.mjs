import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (file) => readFileSync(join(import.meta.dirname, "..", file), "utf8");

/** Every host the lockfile names, and the packages that name a tarball of their own, which pnpm would fetch from there whatever the registry. */
function lockfileHosts(lockfile) {
  const hosts = new Set([...lockfile.matchAll(/\b[a-z][a-z+.-]*:\/\/([^/\s,'"}]+)/gi)].map((match) => match[1].toLowerCase()));
  const tarballs = [...lockfile.matchAll(/^ {2}'?([^\s'][^']*?)'?:\n {4}resolution: \{[^}]*\btarball: ([^,}\s]+)/gm)].map((match) => `${match[1]} (${match[2]})`);
  return { hosts: [...hosts].sort(), tarballs };
}

test("pnpm-lock.yaml installs every package from registry.npmjs.org and names no other registry or tarball host", () => {
  const { hosts, tarballs } = lockfileHosts(read("pnpm-lock.yaml"));
  const fix = "Fix: delete each `tarball:` field and run `pnpm install --lockfile-only --registry=https://registry.npmjs.org/`, keeping every version.";
  assert.deepEqual(hosts.filter((host) => host !== "registry.npmjs.org"), [], `pnpm-lock.yaml names another registry host. ${fix}`);
  assert.deepEqual(tarballs.filter((tarball) => !tarball.includes("https://registry.npmjs.org/")), [], `pnpm-lock.yaml pins packages to a tarball off registry.npmjs.org. ${fix}`);
  assert.match(read(".npmrc"), /^registry=https:\/\/registry\.npmjs\.org\/$/m, ".npmrc must set registry=https://registry.npmjs.org/");
});

test("lockfileHosts finds a corporate feed's tarball and host, and passes a lockfile that names none", () => {
  const feed = "https://ms-feed-25.pkgs.visualstudio.com/1es-public/_packaging/npm-public/npm/registry/@adobe/css-tools/-/css-tools-4.5.0.tgz";
  const leaked = `packages:\n\n  '@adobe/css-tools@4.5.0':\n    resolution: {integrity: sha1-tbcaJaTRavokglkt36YvzMYLx9E=, tarball: ${feed}}\n`;
  assert.deepEqual(lockfileHosts(leaked), { hosts: ["ms-feed-25.pkgs.visualstudio.com"], tarballs: [`@adobe/css-tools@4.5.0 (${feed})`] });
  assert.deepEqual(lockfileHosts("packages:\n\n  '@adobe/css-tools@4.5.0':\n    resolution: {integrity: sha512-abc==}\n"), { hosts: [], tarballs: [] });
});
