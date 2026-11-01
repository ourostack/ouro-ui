import { useState, type JSX } from "react";
import { Autocomplete, type AutocompleteItem } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";

// The live demo at the top of docs/autocomplete/: the component as an app would use it, with its props, nothing else.

const people: AutocompleteItem[] = [
  { value: "avery", label: "Avery Kim", description: "Design", avatar: {} },
  { value: "jordan", label: "Jordan Lee", description: "Engineering", avatar: {} },
  { value: "priya", label: "Priya Natarajan", description: "Research", avatar: {} },
  { value: "sasha", label: "Sasha Ortiz", description: "Product", avatar: {} },
];

const emoji: AutocompleteItem[] = [
  { value: "tada", label: "Party popper", glyph: "🎉", insert: "🎉", description: ":tada:" },
  { value: "thumbsup", label: "Thumbs up", glyph: "👍", insert: "👍", description: ":thumbsup:" },
  { value: "rocket", label: "Rocket", glyph: "🚀", insert: "🚀", description: ":rocket:" },
  { value: "sparkles", label: "Sparkles", glyph: "✨", insert: "✨", description: ":sparkles:" },
];

export default function AutocompleteDemo(): JSX.Element {
  const [text, setText] = useState("");
  return (
    <div className="w-full max-w-md">
      <Autocomplete
        triggers={[
          { char: "@", label: "People", allowSpaces: true, items: people },
          { char: ":", label: "Emoji", minQueryLength: 2, items: emoji },
        ]}
      >
        <TextArea label="Message" placeholder="Type @ to mention someone, or :ro for 🚀" autoGrow rows={2} maxRows={6} value={text} onValueChange={setText} />
      </Autocomplete>
    </div>
  );
}
