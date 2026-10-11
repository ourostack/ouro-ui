// What agents write. Snippets s01-s23 are the review's probe of habits from shadcn/ui,
// Radix, MUI and plain guessing; v01-v05 are the rest of shadcn's Button variants and
// sizes; ok01-ok07 are valid code. Every snippet except the ok ones is a type error on
// purpose. scripts/agent-types.test.mjs runs `tsc` on this file and hovers its props
// through the TypeScript language service, and test/agent-types.test.tsx renders the
// snippets and reads the development messages. scripts/fixtures/agent-types/cases.ts
// lists, for each snippet, which of those channels names the fix.
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ConfirmDialog } from "@/registry/ouro/components/ouro/dialog/confirm-dialog";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";

const open = true;
function setOpen(open: boolean): void {
  void open;
}
const Plus = () => null;

export const s01 = <Button loading tone="primary" variant="ghost">More</Button>;
export const s02 = <Button loading tone="primary" size="icon"><Plus /></Button>;
export const s03 = <Button loading tone="danger">Delete</Button>;
export const s04 = <Button loading tone="primary" asChild><a href="/x">Go</a></Button>;
export const s05 = <Button loading tone="primary" variant="outline" size="xs">Go</Button>;
export const s06 = <Text size="sm" tone="danger">Bad</Text>;
export const s07 = <Text size="sm" color="muted">Hi</Text>;
export const s08 = <Text size="sm" variant="muted">Hi</Text>;
export const s09 = <Heading align="center">Recipes</Heading>;
export const s10 = <Heading level={1} align="center" size="3xl">Recipes</Heading>;
export const s11 = <Heading level={1} align="center" as="h2">Recipes</Heading>;
export const s12 = <Sheet title="Filters" side="bottom" isOpen={open} onClose={() => setOpen(false)}>Body</Sheet>;
export const s13 = <Sheet title="Filters" side="bottom" open={open}>Body</Sheet>;
export const s14 = <Sheet title="Filters" side="left-ish" trigger={<Button>F</Button>}>Body</Sheet>;
export const s15 = <Dialog hideTitle trigger={<Button>Edit</Button>}>Body</Dialog>;
export const s16 = <Dialog title="Edit" size="sm" open={open} onClose={() => setOpen(false)}>Body</Dialog>;
export const s17 = <Dialog title="Edit" size="sm" trigger={<Button>Edit</Button>} open={open} onOpenChange={setOpen}>Body</Dialog>;
export const s18 = <ConfirmDialog title="Delete?" confirmLabel="Delete" tone="destructive" onConfirm={() => {}} open={open} onOpenChange={setOpen} onCancel={() => {}} />;
export const s19 = <ConfirmDialog title="Delete?" confirmText="Delete" onConfirm={() => {}} trigger={<Button>Delete</Button>} />;
export const s20 = <ConfirmDialog title="Delete?" confirmLabel="Delete" variant="destructive" onConfirm={() => {}} trigger={<Button>Delete</Button>} />;
export const s21 = <ConfirmDialog title="Delete?" confirmLabel="Delete" tone="danger" onConfirm={() => {}} trigger={<Button>Delete</Button>} />;
export const s22 = <Dialog title="Edit" size="sm" open={open} onOpenChange={setOpen} position="right">Body</Dialog>;
export const s23 = <Heading level={2} color="red">Recipes</Heading>;

export const v01 = <Button loading tone="primary" variant="destructive">Delete</Button>;
export const v02 = <Button variant="default">Save</Button>;
export const v03 = <Button variant="secondary">Cancel</Button>;
export const v04 = <Button variant="link">Recipes</Button>;
export const v05 = <Button size="default">Save</Button>;

export const ok01 = <Text size="sm" tone="muted">Updated 2 days ago</Text>;
export const ok02 = <Text size="sm" tone="muted" truncate>One line</Text>;
export const ok03 = <Text size="sm" tone="muted" lines={2}>Two lines</Text>;
export const ok04 = <Button loading tone="primary" href="/x">Go</Button>;
export const ok05 = <Heading level={1} size="display">Hero</Heading>;
export const ok06 = <Dialog title="Edit" size="sm" open={open} onOpenChange={setOpen}>Body</Dialog>;
export const ok07 = <ConfirmDialog title="Delete?" confirmLabel="Delete" tone="destructive" onConfirm={() => {}} trigger={<Button>Delete</Button>} />;
