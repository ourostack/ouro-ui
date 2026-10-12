import { Button } from "@/components/ouro/button/button";
import {
  Menu,
  MenuBar,
  MenuCheckboxItem,
  MenuGroup,
  MenuItem,
  MenuSeparator,
  MenuSub,
} from "@/components/ouro/menu/menu";

// expect: Open menu
// expect: aria-haspopup="menu"
// expect: Right-click here
// expect: data-ouro="menu-bar"
export default function MenuSection() {
  return (
    <>
      <Menu trigger={<Button>Open menu</Button>}>
        <MenuGroup label="Recipe">
          <MenuItem href="/edit" shortcut={["mod", "e"]}>
            Edit
          </MenuItem>
          <MenuCheckboxItem defaultChecked>Pinned</MenuCheckboxItem>
        </MenuGroup>
        <MenuSub label="Share">
          <MenuItem href="/share">Copy link</MenuItem>
        </MenuSub>
        <MenuSeparator />
        <MenuItem href="/delete" tone="destructive">
          Delete
        </MenuItem>
      </Menu>
      <Menu contextTrigger={<div>Right-click here</div>} items={[{ label: "Open", href: "/open" }]} />
      <MenuBar aria-label="Editor">
        <Menu label="File" items={[{ label: "New", href: "/new" }]} />
      </MenuBar>
    </>
  );
}
