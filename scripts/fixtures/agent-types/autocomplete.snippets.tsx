// What agents write with autocomplete: snippets whose cases are in autocomplete.cases.ts.
import { Autocomplete } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";

const people = [{ value: "avery", label: "Avery Kim" }];

export const autocomplete01 = <Autocomplete trigger="@" triggers={[{ char: "@", label: "People", items: people }]}><TextArea label="Message" /></Autocomplete>;
export const autocomplete02 = <Autocomplete triggers={[{ char: "@", items: people }]}><TextArea label="Message" /></Autocomplete>;
export const autocompleteOk = <Autocomplete triggers={[{ char: "@", label: "People", items: (query) => people.filter((person) => person.label.includes(query)), onPick: (item) => void item, allowSpaces: true, minQueryLength: 0 }]} resultsLabel={(count) => `${count} people`}><TextArea label="Message" /></Autocomplete>;
