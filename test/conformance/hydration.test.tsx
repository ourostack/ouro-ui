import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { cleanupStories, settle } from "../stories.tsx";
import { conformanceStories } from "./harness.ts";

// Server/client agreement. Every story renders to HTML as a server in UTC and en-US would, and
// that HTML hydrates in a reader's browser in Los Angeles with German formats and in Tokyo with
// Japanese ones. A story whose markup depends on the time zone, the locale, randomness or the
// clock (`Date.now()`, `Math.random()`, `toLocaleString()` during render) makes React throw away
// the server HTML: `onRecoverableError` reports it, or React logs an attribute mismatch, and
// either fails here. The server render runs in this browser (react-dom/server), as
// test/server-elements.test.tsx does, with the page's time zone and locale switched through
// CDP (test/conformance/commands.ts), so it runs no effects, as a server would not.

const server = { timezoneId: "UTC", locale: "en-US" };
const readers = [
  { timezoneId: "America/Los_Angeles", locale: "de-DE" },
  { timezoneId: "Asia/Tokyo", locale: "ja-JP" },
];

const roots: Root[] = [];
const hosts: HTMLElement[] = [];

/** `navigator.language` and `languages` as the reader's browser reports them; CDP leaves them alone. */
function setLanguage(locale: string): void {
  for (const [name, value] of [
    ["language", locale],
    ["languages", [locale]],
  ] as const) {
    Object.defineProperty(navigator, name, { configurable: true, get: () => value });
  }
}

beforeAll(async () => {
  // The page's own time zone and locale stay the server's between tests.
  await commands.emulateLocale(server);
  setLanguage(server.locale);
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const host of hosts.splice(0)) host.remove();
  await commands.emulateLocale(server);
  setLanguage(server.locale);
  await cleanupStories();
});

describe("server HTML hydrates in another time zone and locale", () => {
  it.each(conformanceStories)("$id", async ({ Story, parameters }) => {
    await commands.emulateLocale(server);
    setLanguage(server.locale);
    if (parameters.conformance?.clientOnly) {
      expect(() => renderToString(<Story />), `${parameters.conformance.clientOnly}: the story now renders on a server, so remove its clientOnly`).toThrow();
      return;
    }
    const html = renderToString(<Story />);
    const problems: string[] = [];
    for (const reader of readers) {
      await commands.emulateLocale(reader);
      setLanguage(reader.locale);
      const host = document.createElement("div");
      host.dataset["storyHost"] = "";
      host.innerHTML = html;
      document.body.append(host);
      hosts.push(host);
      // React reports an attribute mismatch on the console rather than as a recoverable error.
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await act(async () => {
          roots.push(
            hydrateRoot(host, <Story />, {
              onRecoverableError: (error) => problems.push(`${reader.timezoneId} ${reader.locale}: ${String((error as Error).message ?? error).split("\n")[0]}`),
            }),
          );
        });
        await settle();
      } finally {
        // React's message ends with the tree, the mismatched lines marked + (client) and - (server).
        problems.push(
          ...logged.mock.calls.map((call) => {
            const text = call.map(String).join(" ");
            const diff = text.split("\n").filter((line) => /^\s*[+-]\s/.test(line));
            return `${reader.timezoneId} ${reader.locale}: ${text.split("\n")[0]}${diff.length ? `\n${diff.join("\n")}` : ""}`;
          }),
        );
        logged.mockRestore();
      }
      await act(async () => roots.pop()?.unmount());
      host.remove();
    }
    expect(problems.join("\n")).toBe("");
  });
});
