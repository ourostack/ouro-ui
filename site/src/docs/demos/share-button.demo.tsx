import { type JSX } from "react";
import { ShareButton } from "@/registry/ouro/components/ouro/share-button/share-button";
import { Text } from "@/registry/ouro/components/ouro/text/text";

// The live demo at the top of docs/share-button/: the component as an app would use it, with its props, nothing else.

export default function ShareButtonDemo(): JSX.Element {
  return (
    <div className="flex max-w-sm items-center gap-3">
      <Text as="span" size="lg" className="min-w-0 flex-1 truncate">
        <strong>Trail notes</strong>
      </Text>
      <ShareButton url="https://example.com/notes/42" title="Trail notes" label="Share notes" />
      <ShareButton url="https://example.com/notes/42/map" title="Trail map" label="Share map" hideLabel variant="plain" />
    </div>
  );
}
