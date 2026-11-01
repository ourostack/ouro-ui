// What agents write with emoji: snippets whose cases are in emoji.cases.ts.
import { Emoji, EmojiText, type EmojiCatalogue, type EmojiItem } from "@/registry/ouro/components/ouro/emoji/emoji";

const party: EmojiItem = { id: "party", name: "Party popper", shortcodes: ["party"], src: "/emoji/party.png", animatedSrc: "/emoji/party.gif" };
const catalogue: EmojiCatalogue = { categories: [{ id: "symbols", label: "Symbols", items: [party] }] };

export const emoji01 = <Emoji item={party} src="/emoji/party.png" />;
export const emoji02 = <Emoji item={party} emoji="🎉" />;
export const emoji03 = <Emoji item={party} animate />;
export const emoji04 = <EmojiText catalogue={catalogue}>Shipped :party:</EmojiText>;
export const emojiOk01 = <Emoji item={party} skinTone="medium" play alt="" className="ms-1" />;
export const emojiOk02 = <EmojiText text="Shipped :party:" catalogue={catalogue} enlarge className="mt-1" />;
