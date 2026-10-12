import type { JSX } from "react";
import { HoverCard } from "@/registry/ouro/components/ouro/hover-card/hover-card";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/hover-card/: the component as an app would use it, with its props, nothing else.

export default function HoverCardDemo(): JSX.Element {
  return (
    <Text align="center">
      Shakshuka by{" "}
      <HoverCard trigger={<Link href="#cooks/ari">Ari Mendelow</Link>}>
        <Text size="sm">Cooks mostly Persian food. 42 recipes, 6 cookbooks.</Text>
      </HoverCard>
    </Text>
  );
}
