import { type JSX } from "react";
import { LocalDate } from "@/registry/ouro/components/ouro/local-date/local-date";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/local-date/: the component as an app would use it, with its props, nothing else.

export default function LocalDateDemo(): JSX.Element {
  return (
    <div className="grid gap-2">
      <Text>
        Trail reopens <LocalDate value="2026-06-01T09:30:00Z" />.
      </Text>
      <Text tone="muted" size="sm">
        Updated <LocalDate value="2026-06-01T09:30:00Z" format="datetime" />
      </Text>
    </div>
  );
}
