import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { server } from "vitest/browser";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import type { EmojiCatalogue, EmojiItem } from "@/registry/ouro/components/ouro/emoji/emoji";
import { splitEmojiText } from "@/registry/ouro/components/ouro/emoji/emoji-styles";
import { EmojiPicker } from "@/registry/ouro/components/ouro/emoji-picker/emoji-picker";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// What a large emoji catalogue costs as an app switches conversations: each conversation's reply box mounts a closed
// EmojiPicker, and a catalogue whose pictures get new addresses (a CDN's signed addresses) is indexed again. Recorded in
// each run's notes (a GitHub notice on CI), so a change in the cost shows beside the change. It holds only what any version
// must: the pickers mount closed, and the text finds its emoji.

const COUNT = 3000;
const MOUNTS = 20;

/** A catalogue of `COUNT` emoji, a fifth with five tones, their pictures at `version`. */
function catalogueAt(version: number): EmojiCatalogue {
  const items: EmojiItem[] = Array.from({ length: COUNT }, (_, at) => ({
    id: `emoji-${at}`,
    name: `Emoji ${at}`,
    shortcodes: [`e${at}`],
    keywords: ["word"],
    text: String.fromCodePoint(0x4e00 + at),
    src: `/emoji/${at}.png?v=${version}`,
    ...(at % 5 === 0 && { skinTones: [1, 2, 3, 4, 5].map((tone) => ({ id: `emoji-${at}-tone${tone}`, src: `/emoji/${at}-${tone}.png?v=${version}` })) }),
  }));
  return { categories: Array.from({ length: 10 }, (_, at) => ({ id: `c${at}`, label: `Category ${at}`, items: items.slice(at * (COUNT / 10), (at + 1) * (COUNT / 10)) })) };
}

const roots: Root[] = [];
const hosts: HTMLElement[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  hosts.splice(0).forEach((host) => host.remove());
});
const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]!;

it("mounts closed emoji pickers and indexes a catalogue of 3,000 emoji whose pictures moved, and records what it costs", async ({ annotate }) => {
  const catalogue = catalogueAt(1);
  const mounts: number[] = [];
  for (let at = 0; at < MOUNTS; at++) {
    const host = document.createElement("div");
    document.body.append(host);
    hosts.push(host);
    const root = createRoot(host);
    roots.push(root);
    const start = performance.now();
    flushSync(() => root.render(<EmojiPicker label="Add an emoji" catalogue={catalogue} trigger={<Button aria-label="Emoji">+</Button>} onSelect={() => {}} />));
    mounts.push(performance.now() - start);
  }
  expect(document.querySelectorAll('[data-ouro="emoji-picker"]')).toHaveLength(0);
  // The catalogue as the conversation's text first found its emoji; then the same catalogue with its pictures moved.
  splitEmojiText(`hi ${String.fromCodePoint(0x4e00 + 3)}`, catalogue);
  const indexed: number[] = [];
  for (let version = 2; version < 4; version++) {
    const moved = catalogueAt(version);
    const start = performance.now();
    const parts = splitEmojiText(`hi ${String.fromCodePoint(0x4e00 + 7)}`, moved);
    indexed.push(performance.now() - start);
    expect(parts).toEqual(["hi ", { item: moved.categories[0]!.items[7], tone: "default", source: String.fromCodePoint(0x4e00 + 7) }]);
  }
  await annotate(
    `${server.browser}, a catalogue of ${COUNT} emoji: first closed picker ${Math.round(mounts[0]!)} ms, each later one ${median(mounts.slice(1)).toFixed(1)} ms (median of ${MOUNTS - 1}); ` +
      `indexing it again after its pictures moved ${median(indexed).toFixed(1)} ms (median of ${indexed.length})`,
  );
});
