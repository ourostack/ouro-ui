import { type JSX } from "react";
import { RelativeTime } from "@/registry/ouro/components/ouro/relative-time/relative-time";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/relative-time/: the component as an app would use it, with its props, nothing else.

export default function RelativeTimeDemo(): JSX.Element {
  return (
    <div className="grid gap-2">
      <Text size="sm">
        <strong>Avery</strong>{" "}
        <Text as="span" size="sm" tone="muted">
          <RelativeTime value="2026-06-01T09:30:00Z" />
        </Text>
      </Text>
      <Text size="sm">Bridge is open again.</Text>
    </div>
  );
}
