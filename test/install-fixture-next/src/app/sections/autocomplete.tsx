import { Autocomplete } from "@/components/ouro/autocomplete/autocomplete";
import { TextArea } from "@/components/ouro/text-field/text-area";

// expect: aria-autocomplete="list"
// expect: Message
export default function AutocompleteSection() {
  return (
    <Autocomplete
      triggers={[
        {
          char: "@",
          label: "People",
          items: [
            { value: "avery", label: "Avery Kim", avatar: {} },
            { value: "jordan", label: "Jordan Lee", avatar: {} },
          ],
        },
      ]}
    >
      <TextArea label="Message" />
    </Autocomplete>
  );
}
