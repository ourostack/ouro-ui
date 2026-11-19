import { useState, type JSX } from "react";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { TypingIndicator } from "@/registry/ouro/components/ouro/typing-indicator/typing-indicator";

// The live demo at the top of docs/typing-indicator/: the component as an app would use it, with its props, nothing else.

const crew = [{ name: "Ned Land" }, { name: "Conseil" }, { name: "Captain Nemo" }];

export default function TypingIndicatorDemo(): JSX.Element {
  const [count, setCount] = useState("1");
  return (
    <div className="grid w-full gap-4">
      <SegmentedControl label="Who is writing" value={count} onValueChange={setCount} items={[{ value: "0", label: "Nobody" }, { value: "1", label: "One" }, { value: "2", label: "Two" }, { value: "3", label: "Three" }]} />
      <TypingIndicator people={crew.slice(0, Number(count))} />
    </div>
  );
}
