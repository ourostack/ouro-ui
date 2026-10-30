import { useState, type JSX } from "react";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";

// The live demo at the top of docs/composer/: the component as an app would use it, with its props, nothing else.

export default function ComposerDemo(): JSX.Element {
  const [sent, setSent] = useState<string[]>([]);
  return (
    <div className="grid w-full max-w-lg gap-3">
      {sent.map((message, index) => (
        <p key={index} className="m-0 justify-self-end rounded-xl bg-muted px-3 py-1.5 whitespace-pre-wrap">
          {message}
        </p>
      ))}
      <Composer
        label="Message Mia"
        placeholder="Write a message"
        defaultValue="Thanks for the recipe!"
        highlights={[{ start: 0, end: 22, label: "Suggested by your assistant" }]}
        description="Your assistant's suggestion is underlined."
        onSend={(text) => setSent([...sent, text])}
      />
    </div>
  );
}
