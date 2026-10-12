import { type JSX } from "react";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";

// The live demo at the top of docs/text-area/: the component as an app would use it, with its props, nothing else.

export default function TextAreaDemo(): JSX.Element {
  return (
    <div className="grid w-full max-w-sm gap-4">
      <TextArea label="Message" name="message" autoGrow rows={2} maxRows={6} placeholder="Write to the cook" description="It grows as you type." />
    </div>
  );
}
