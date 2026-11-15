import { type JSX } from "react";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { UnreadDot } from "@/registry/ouro/components/ouro/unread-dot/unread-dot";

// The live demo at the top of docs/unread-dot/: the component as an app would use it, with its props, nothing else.

export default function UnreadDotDemo(): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <Text>Ana Lind</Text>
      <UnreadDot label="Unread" />
    </div>
  );
}
