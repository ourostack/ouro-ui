import { type JSX } from "react";
import { CopyButton } from "@/registry/ouro/components/ouro/copy-button/copy-button";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/copy-button/: the component as an app would use it, with its props, nothing else.

export default function CopyButtonDemo(): JSX.Element {
  return (
    <div className="grid max-w-sm gap-3">
      <div className="flex items-center gap-3">
        <Text as="span" size="sm" className="min-w-0 flex-1 truncate">
          <code>pk_live_51Hx2vQ</code>
        </Text>
        <CopyButton value="pk_live_51Hx2vQ" label="Copy key" />
      </div>
      <div className="flex items-center gap-1">
        <Text as="span" size="sm" tone="muted" className="min-w-0 flex-1 truncate">
          https://example.com/invite/7Gk2
        </Text>
        <CopyButton value="https://example.com/invite/7Gk2" label="Copy invite link" hideLabel variant="plain" />
      </div>
    </div>
  );
}
