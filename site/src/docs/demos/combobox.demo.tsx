import { useEffect, useRef, useState, type JSX } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Combobox } from "@/registry/ouro/components/ouro/combobox/combobox";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";

// The live demo at the top of docs/combobox/: the component as an app would use it, with its props, nothing else.

const people = [
  { value: "rowan", label: "Rowan Vale", description: "Principal Engineer · Platform", media: <Avatar name="Rowan Vale" alt="" size="xs" />, meta: <Badge>1:1</Badge> },
  { value: "iris", label: "Iris Okafor", description: "Product Designer", media: <Avatar name="Iris Okafor" alt="" size="xs" /> },
  { value: "theo", label: "Theo Brandt", description: "Support Lead", media: <Avatar name="Theo Brandt" alt="" size="xs" /> },
];

export default function ComboboxDemo(): JSX.Element {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string[]>(["iris"]);
  const [answer, setAnswer] = useState({ query: "", people });
  const message = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnswer({ query: text, people: people.filter((person) => person.label.toLowerCase().includes(text.toLowerCase())) });
    }, 450);
    return () => clearTimeout(timer);
  }, [text]);
  return (
    <form className="grid w-full max-w-sm gap-4" onSubmit={(event) => event.preventDefault()}>
      <Combobox
        label="To"
        name="to"
        multiple
        autoHighlight
        items={answer.people}
        resultsFor={answer.query}
        loading={answer.query !== text}
        loadingLabel="Finding people…"
        emptyLabel="No one by that name"
        inputValue={text}
        onInputChange={setText}
        value={picked}
        onValueChange={(next) => {
          setPicked(next);
          setText("");
        }}
        onInputKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.nativeEvent.isComposing && !text && picked.length) {
            event.preventDefault();
            message.current?.focus();
          }
        }}
        placeholder="Add someone"
      />
      <TextArea ref={message} label="Message" name="message" rows={2} placeholder="Start a conversation" />
    </form>
  );
}
