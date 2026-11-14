import { describe, expect, it } from "vitest";
import { resolveMessages } from "@/registry/ouro/lib/ouro/a2ui-core";
import { vendored } from "../scripts/vendored.mjs";
import core from "./fixtures/a2ui/core.json";

// The A2UI module and its conformance cases are core's (ourostack/ouro-ui-core), copied byte for byte and pinned
// in fixtures/a2ui/core.json. These tests prove the copies are the pinned bytes, and that web's copy resolves every
// case to what core says it must: the same check Apple's OuroA2UI runs, which is the web and Apple parity check.

const raw: Record<string, string> = {
  ...import.meta.glob("/registry/ouro/lib/ouro/a2ui-core.ts", { query: "?raw", import: "default", eager: true }),
  ...import.meta.glob("/test/fixtures/a2ui/**/*.json", { query: "?raw", import: "default", eager: true }),
};

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const json = (path: string): unknown => JSON.parse(raw[`/${path}`]!);

describe("A2UI files vendored from core", () => {
  it("are byte for byte the files core.json pins, and every case core pinned is here", async () => {
    for (const [path, pin] of Object.entries(core.files)) {
      expect(raw[`/${path}`], `${path} is missing`).toBeTypeOf("string");
      expect(await sha256(raw[`/${path}`]!), `${path} differs from ${core.coreTag}'s ${pin.from}. Fix: copy it from that release, never edit it.`).toBe(pin.sha256);
    }
    const cases = Object.keys(raw).filter((p) => p.startsWith("/test/fixtures/a2ui/cases/"));
    expect(cases.map((p) => p.slice(1)).sort()).toEqual(Object.keys(core.files).filter((p) => p.includes("/cases/")).sort());
    // Coverage, mutation testing and the docs leave out exactly the registry files pinned here (scripts/vendored.mjs).
    expect(vendored).toEqual(Object.keys(core.files).filter((p) => p.startsWith("registry/")));
  });
});

describe("A2UI conformance", () => {
  const cases = Object.keys(raw).filter((p) => p.startsWith("/test/fixtures/a2ui/cases/")).sort();

  it.each(cases)("%s resolves to its expect", (path) => {
    const c = json(path.slice(1)) as { catalog: string; messages: unknown[]; expect: unknown };
    expect(resolveMessages(json(`test/fixtures/a2ui/${c.catalog}`), c.messages)).toEqual(c.expect);
  });
});
