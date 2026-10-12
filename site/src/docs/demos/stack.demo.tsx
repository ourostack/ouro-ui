import { type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Stack } from "@/registry/ouro/components/ouro/stack/stack";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/stack/: the component as an app would use it, with its props, nothing else.

export default function StackDemo(): JSX.Element {
  return (
    <Stack gap="sm" align="start">
      <Heading level={2}>Short ribs</Heading>
      <Text tone="muted">Seared hard, braised low, rested overnight.</Text>
      <Button>Start cooking</Button>
    </Stack>
  );
}
