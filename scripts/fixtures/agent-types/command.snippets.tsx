// What agents write with command: snippets whose cases are in command.cases.ts.
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Command } from "@/registry/ouro/components/ouro/command/command";
import { open, setOpen } from "./helpers.ts";

const create = () => {};

export const command01 = <Command title="Commands" trigger={<Button>Search</Button>} items={[{ label: "New recipe", onClick: create }]} />;
export const command02 = <Command title="Commands" trigger={<Button>Search</Button>}>New recipe</Command>;
export const command03 = <Command title="Commands" trigger={<Button>Search</Button>} isOpen={open} items={[{ label: "New recipe", onSelect: create }]} />;
export const command04 = <Command title="Chats" trigger={<Button>Search</Button>} items={[{ label: "Jump to chat", onSelect: create, forceMount: true }]} />;
export const command05 = <Command title="Chats" trigger={<Button>Search</Button>} items={[{ label: "Go to", forceMount: true, items: [{ label: "Jump to chat", onSelect: create }] }]} />;
export const commandOk01 = <Command title="Commands" open={open} onOpenChange={setOpen} placeholder="Search recipes…" items={[{ label: "Recipes", items: [{ label: "New recipe", onSelect: create, shortcut: ["mod", "n"], keywords: ["add"] }] }]} />;
export const commandOk02 = <Command title="Chats" open={open} onOpenChange={setOpen} emptyLabel="No chats by that name." items={[{ label: "Launch planning", onSelect: create }, { label: "Jump to chat", onSelect: create, alwaysShown: true }]} />;
export const commandOk03 = <Command title="Chats" open={open} onOpenChange={setOpen} emptyLabel="No chats by that name." items={[{ label: "Chats", items: [{ label: "Launch planning", onSelect: create }] }, { label: "Go to", alwaysShown: true, items: [{ label: "Jump to chat", onSelect: create }] }]} />;
