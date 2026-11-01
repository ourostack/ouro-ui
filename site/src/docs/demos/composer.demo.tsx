import { useState, type JSX } from "react";
import { Composer, type ComposerQuote } from "@/registry/ouro/components/ouro/composer/composer";
import { Message } from "@/registry/ouro/components/ouro/message/message";

// The live demo at the top of docs/composer/: the component as an app would use it, with its props, nothing else.

const question = { author: "Mia Torres", excerpt: "Could you send me the recipe for the rye loaf from Saturday?" };

export default function ComposerDemo(): JSX.Element {
  const [quoted, setQuoted] = useState<Omit<ComposerQuote, "onRemove"> | undefined>(question);
  const [sent, setSent] = useState<{ text: string; quoted: typeof quoted }[]>([]);
  return (
    <div className="grid w-full max-w-lg gap-3">
      {sent.map((message, index) => (
        <Message key={index} variant="chat" role="user" name="You" quote={message.quoted}>
          {message.text}
        </Message>
      ))}
      <Composer
        label="Message Mia"
        placeholder="Write a message"
        defaultValue="Thanks for the recipe!"
        highlights={[{ start: 0, end: 22, label: "Suggested by your assistant" }]}
        description="Your assistant's suggestion is underlined."
        quote={quoted && { ...quoted, onRemove: () => setQuoted(undefined) }}
        onSend={(text) => {
          setSent([...sent, { text, quoted }]);
          setQuoted(undefined);
        }}
      />
    </div>
  );
}
