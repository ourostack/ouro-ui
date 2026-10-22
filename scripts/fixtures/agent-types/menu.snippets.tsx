// What agents write with menu: snippets whose cases are in menu.cases.ts.
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Menu, MenuItem } from "@/registry/ouro/components/ouro/menu/menu";
import { open, setOpen } from "./helpers.ts";

const edit = () => {};

export const menu01 = <Menu trigger={<Button>Actions</Button>} placement="bottom-start" items={[{ label: "Edit", onClick: edit }]} />;
export const menu02 = <Menu open={open} onOpenChange={setOpen} trigger={<Button>Actions</Button>}><MenuItem variant="destructive" onClick={edit}>Delete</MenuItem></Menu>;
export const menu03 = <Menu open={open} onOpenChange={setOpen} trigger={<Button>Actions</Button>}><MenuItem onSelect={edit}>Edit</MenuItem></Menu>;
export const menu04 = <Menu open={open} onOpenChange={setOpen} trigger={<Button>Actions</Button>}><MenuItem onClick={edit} shortcut="mod+e">Edit</MenuItem></Menu>;
export const menu05 = <Menu trigger={<Button>Actions</Button>} options={[{ label: "Edit", onClick: edit }]} items={[]} />;
export const menu06 = <Menu trigger={<Button>Actions</Button>} isOpen={open} items={[{ label: "Edit", onClick: edit }]} />;
export const menu07 = <Menu contextTrigger={<div>Recipe card</div>} modal={false} items={[{ label: "Edit", onClick: edit }]} />;
export const menuOk01 = <Menu open={open} onOpenChange={setOpen} trigger={<Button>Actions</Button>} side="top" align="end" items={[{ label: "Edit", onClick: edit, shortcut: ["mod", "e"] }, { type: "separator" }, { label: "Delete", tone: "destructive", onClick: edit }]} />;
