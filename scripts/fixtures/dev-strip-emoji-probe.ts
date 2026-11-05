// Bundled by scripts/dev-strip.test.mjs to prove the emoji index's rebuild warning is development only.
import type { EmojiItem } from "@/registry/ouro/components/ouro/emoji/emoji";
import { catalogueIndex } from "@/registry/ouro/components/ouro/emoji/emoji-styles";

const party: EmojiItem = { id: "party", name: "Party popper", text: "🎉", src: "/emoji/party.png" };

/** Indexes the same emoji `times` times, each in new objects, as an app that rebuilds its catalogue for each message does. */
export function rebuildProbe(times: number): void {
  for (let count = 0; count < times; count += 1) catalogueIndex({ categories: [{ id: "all", label: "All", items: [{ ...party }] }] });
}
