import { Emoji, EmojiText, type EmojiCatalogue } from "@/components/ouro/emoji/emoji";

const party = { id: "party", name: "Party popper", shortcodes: ["party"], src: "/emoji/party.png", animatedSrc: "/emoji/party.gif" };
const catalogue: EmojiCatalogue = { categories: [{ id: "symbols", label: "Symbols", items: [party] }] };

// The server draws the still image, named by the emoji's name, and a token in text as its image.
// expect: data-ouro="emoji"
// expect: alt="Party popper"
// expect: src="/emoji/party.png"
// expect: Ouro emoji text
export default function EmojiSection() {
  return (
    <p>
      <Emoji item={party} play />
      <EmojiText text="Ouro emoji text :party:" catalogue={catalogue} />
    </p>
  );
}
