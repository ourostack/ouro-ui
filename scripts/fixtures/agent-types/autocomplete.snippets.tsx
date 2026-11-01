// What agents write with autocomplete: snippets whose cases are in autocomplete.cases.ts.
import { Autocomplete } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
import type { EmojiCatalogue } from "@/registry/ouro/components/ouro/emoji/emoji";

const people = [{ value: "avery", label: "Avery Kim" }];
const catalogue: EmojiCatalogue = { categories: [{ id: "symbols", label: "Symbols", items: [{ id: "party", name: "Party popper", shortcodes: ["party"], src: "/emoji/party.png" }] }] };

export const autocomplete01 = <Autocomplete trigger="@" triggers={[{ char: "@", label: "People", items: people }]}><TextArea label="Message" /></Autocomplete>;
export const autocomplete02 = <Autocomplete triggers={[{ char: "@", items: people }]}><TextArea label="Message" /></Autocomplete>;
export const autocompleteOk = <Autocomplete triggers={[{ char: "@", label: "People", items: (query) => people.filter((person) => person.label.includes(query)), onPick: (item) => void item, allowSpaces: true, minQueryLength: 0 }]} resultsLabel={(count) => `${count} people`}><TextArea label="Message" /></Autocomplete>;
export const autocompleteOk02 = <Autocomplete triggers={[{ char: ":", label: "Emoji", minQueryLength: 2, catalogue, onPick: (item) => void item.emoji }]}><TextArea label="Message" /></Autocomplete>;
