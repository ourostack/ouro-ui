import { type JSX } from "react";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { ReadReceipt } from "@/registry/ouro/components/ouro/read-receipt/read-receipt";

// The live demo at the top of docs/read-receipt/: the component as an app would use it, with its props, nothing else.

export default function ReadReceiptDemo(): JSX.Element {
  return (
    <div className="grid w-full gap-3">
      <Message variant="chat" role="user" name="You" footer={<ReadReceipt readers={[{ name: "Grace Hopper" }, { name: "Katherine Johnson" }]} />}>
        Yes, ten sharp.
      </Message>
      <Message variant="chat" role="user" name="You" footer={<ReadReceipt readers={[{ name: "Ana Lind" }, { name: "Alan Turing" }, { name: "Edsger Dijkstra" }, { name: "Radia Perlman" }]} />}>
        Bring the engine notes.
      </Message>
    </div>
  );
}
