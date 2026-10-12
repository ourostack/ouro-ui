// What agents write with confirm-dialog: snippets whose cases are in confirm-dialog.cases.ts.
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ConfirmDialog } from "@/registry/ouro/components/ouro/dialog/confirm-dialog";
import { open, setOpen } from "./helpers.ts";

export const s18 = <ConfirmDialog title="Delete?" confirmLabel="Delete" tone="destructive" onConfirm={() => {}} open={open} onOpenChange={setOpen} onCancel={() => {}} />;
export const s19 = <ConfirmDialog title="Delete?" confirmText="Delete" onConfirm={() => {}} trigger={<Button>Delete</Button>} />;
export const s20 = <ConfirmDialog title="Delete?" confirmLabel="Delete" variant="destructive" onConfirm={() => {}} trigger={<Button>Delete</Button>} />;
export const s21 = <ConfirmDialog title="Delete?" confirmLabel="Delete" tone="danger" onConfirm={() => {}} trigger={<Button>Delete</Button>} />;
export const ok07 = <ConfirmDialog title="Delete?" confirmLabel="Delete" tone="destructive" onConfirm={() => {}} trigger={<Button>Delete</Button>} />;
