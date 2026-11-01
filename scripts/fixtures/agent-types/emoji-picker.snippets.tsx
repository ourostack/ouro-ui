// What agents write with emoji-picker: snippets whose cases are in emoji-picker.cases.ts.
import { createRef } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { EmojiPicker, type EmojiPickerCategory } from "@/registry/ouro/components/ouro/emoji-picker/emoji-picker";
import type { EmojiCatalogue } from "@/registry/ouro/components/ouro/emoji/emoji";
import { open, setOpen } from "./helpers.ts";

const anchor = createRef<HTMLButtonElement>();
const categories: EmojiPickerCategory[] = [{ label: "Smileys", emoji: [{ emoji: "😀", name: "grinning face", keywords: ["smile"] }] }];
const insert = (text: string) => void text;
const catalogue: EmojiCatalogue = { categories: [{ id: "custom", label: "Fernwood", items: [{ id: "fern", name: "Fernwood fern", shortcodes: ["fern"], src: "/emoji/fern.png", custom: true }] }] };

export const emojiPicker01 = <EmojiPicker label="Insert emoji" categories={categories} trigger={<Button>Emoji</Button>} onSelect={() => {}} onEmojiSelect={(emoji: string) => insert(emoji)} />;
export const emojiPicker02 = <EmojiPicker categories={categories} trigger={<Button>Emoji</Button>} onSelect={(selection) => insert(selection.emoji)} />;
export const emojiPicker03 = <EmojiPicker label="Insert emoji" categories={categories} trigger={<Button>Emoji</Button>} onSelect={(selection) => insert(selection.emoji)} data={categories} />;
export const emojiPickerOk01 = <EmojiPicker label="Add a reaction" categories={categories} frequent={categories[0]!.emoji} quick={categories[0]!.emoji} trigger={<Button aria-label="Add a reaction">+</Button>} skinTone="medium" onSkinToneChange={(tone) => void tone} onSelect={(selection, event) => void [selection.emoji, event.isTrusted]} />;
export const emojiPickerOk02 = <EmojiPicker label="Insert emoji" categories={categories} open={open} onOpenChange={setOpen} anchor={anchor} presentation="sheet" side="top" align="start" searchLabel="Find" frequentLabel="Recent" quickLabel="Quick" categoriesLabel="Groups" skinToneLabel="Tone" resultsLabel="{count} found" noResultsLabel="None" closeLabel="Done" className="w-96" onSelect={(selection) => insert(selection.emoji)} />;
export const emojiPickerOk03 = <EmojiPicker label="Add a reaction" catalogue={catalogue} frequent={["fern"]} quick={["fern"]} trigger={<Button aria-label="Add a reaction">+</Button>} onSelect={(selection) => void [selection.id, selection.token, selection.item.custom]} />;
