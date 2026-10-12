import { type JSX } from "react";
import { Message } from "@/registry/ouro/components/ouro/message/message";

// The live demo at the top of docs/message/: the component as an app would use it, with its props, nothing else.

export default function MessageDemo(): JSX.Element {
  return (
    <div className="grid gap-4">
      <Message role="user" name="Ada Lovelace">
        How long should the dough rest?
      </Message>
      <Message role="assistant" name="Ouro">
        About an hour, covered, somewhere warm. It is ready when it has doubled.
      </Message>
    </div>
  );
}
