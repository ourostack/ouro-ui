// What an agent with shadcn/ui habits writes. Each element below is a type error on
// purpose: scripts/agent-types.test.mjs runs `tsc` on this file and asserts the exact
// messages, and hovers the props through the TypeScript language service to assert
// the editor still shows each prop's JSDoc.
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ConfirmDialog } from "@/registry/ouro/components/ouro/dialog/confirm-dialog";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";

// Guard props.
export const button = <Button loading tone="primary" isLoading>Save</Button>;
export const sheet = <Sheet title="Filters" trigger={<Button>Filter</Button>} isOpen>Body</Sheet>;
export const dialog = <Dialog title="Edit" trigger={<Button>Edit</Button>} isOpen>Body</Dialog>;
export const confirm = <ConfirmDialog title="Delete?" confirmLabel="Delete" tone="destructive" onConfirm={() => {}} trigger={<Button>Delete</Button>} isOpen />;

// shadcn's Button variants and sizes.
export const destructive = <Button loading tone="primary" variant="destructive">Delete</Button>;
export const variantDefault = <Button variant="default">Save</Button>;
export const secondary = <Button variant="secondary">Cancel</Button>;
export const ghost = <Button variant="ghost">More</Button>;
export const link = <Button variant="link">Recipes</Button>;
export const sizeDefault = <Button size="default">Save</Button>;
export const icon = <Button size="icon">+</Button>;
