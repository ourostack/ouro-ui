import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Menu, MenuGroup, MenuItem, MenuSeparator, MenuSub } from "@/registry/ouro/components/ouro/menu/menu";

// The live demo at the top of docs/menu/: the component as an app would use it, with its props, nothing else.

export default function MenuDemo(): JSX.Element {
  return (
    <Menu trigger={<Button variant="soft">Actions</Button>}>
      <MenuGroup label="Recipe">
        <MenuItem shortcut={["mod", "e"]}>Edit</MenuItem>
        <MenuItem shortcut={["mod", "d"]}>Duplicate</MenuItem>
      </MenuGroup>
      <MenuSub label="Share">
        <MenuItem>Copy link</MenuItem>
        <MenuItem>Email</MenuItem>
      </MenuSub>
      <MenuSeparator />
      <MenuItem tone="destructive">Delete</MenuItem>
    </Menu>
  );
}
