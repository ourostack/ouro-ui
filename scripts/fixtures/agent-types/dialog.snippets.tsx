// What agents write with dialog: snippets whose cases are in dialog.cases.ts.
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { DialogPopup, DialogPortal, DialogRoot } from "@/registry/ouro/components/ouro/dialog/dialog-parts";
import { open, setOpen } from "./helpers.ts";

export const s15 = <Dialog hideTitle trigger={<Button>Edit</Button>}>Body</Dialog>;
export const s16 = <Dialog title="Edit" size="sm" open={open} onClose={() => setOpen(false)}>Body</Dialog>;
export const s17 = <Dialog title="Edit" size="sm" trigger={<Button>Edit</Button>} open={open} onOpenChange={setOpen}>Body</Dialog>;
export const s22 = <Dialog title="Edit" size="sm" open={open} onOpenChange={setOpen} position="right">Body</Dialog>;
export const s31 = <DialogRoot open><DialogPortal><DialogPopup size="xl">Body</DialogPopup></DialogPortal></DialogRoot>;
export const ok06 = <Dialog title="Edit" size="sm" open={open} onOpenChange={setOpen}>Body</Dialog>;
