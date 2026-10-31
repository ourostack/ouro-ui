import type { JSX } from "react";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Command } from "@/registry/ouro/components/ouro/command/command";

// The live demo at the top of docs/command/: the component as an app would use it, with its props, nothing else.

const noop = () => {};

export default function CommandDemo(): JSX.Element {
  return (
    <Command
      title="Command palette"
      trigger={<Button variant="soft">Search…</Button>}
      items={[
        {
          label: "Chats",
          items: [
            { label: "Mona Example", onSelect: noop, avatar: <Avatar name="Mona Example" alt="" size="xs" />, unread: true, mark: <Badge>2</Badge> },
            { label: "Kai Sample", onSelect: noop, avatar: <Avatar name="Kai Sample" alt="" size="xs" /> },
          ],
        },
        {
          label: "Recipes",
          items: [
            { label: "New recipe", onSelect: noop, shortcut: ["mod", "n"] },
            { label: "Import from a link", onSelect: noop, keywords: ["url"] },
          ],
        },
        { label: "Settings", items: [{ label: "Switch theme", onSelect: noop, keywords: ["dark mode"] }] },
      ]}
    />
  );
}
