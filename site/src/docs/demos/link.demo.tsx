import { type JSX } from "react";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/link/: the component as an app would use it, with its props, nothing else.

export default function LinkDemo(): JSX.Element {
  return (
    <div className="grid max-w-sm gap-2">
      <Text>
        Braise as in <Link href="#braising">our braising guide</Link>, then rest overnight.
      </Text>
      <Text size="sm" tone="muted">
        Adapted from{" "}
        <Link href="https://example.com/short-ribs" external>
          the original recipe
        </Link>
        .
      </Text>
      <nav aria-label="Chapters" className="flex gap-4">
        <Link href="#prep">Prep</Link>
        <Link href="#braise" current>
          Braise
        </Link>
        <Link href="#serve">Serve</Link>
      </nav>
    </div>
  );
}
