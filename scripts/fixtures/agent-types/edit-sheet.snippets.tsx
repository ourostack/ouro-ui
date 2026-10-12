// What agents write with edit-sheet: snippets whose cases are in edit-sheet.cases.ts.
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { EditSheet } from "@/registry/ouro/components/ouro/form/edit-sheet";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { open, setOpen } from "./helpers.ts";

const save = async (data: FormData) => (data.get("name") ? undefined : { name: "Required." });

export const editSheet01 = <EditSheet title="Edit recipe" trigger={<Button>Edit</Button>} onSave={save}><TextField label="Name" name="name" /></EditSheet>;
export const editSheet02 = <EditSheet title="Edit recipe" trigger={<Button>Edit</Button>} onSubmit={save} saveLabel="Save recipe"><TextField label="Name" name="name" /></EditSheet>;
export const editSheet03 = <EditSheet title="Edit recipe" trigger={<Button>Edit</Button>} onSubmit={save} errors={{ name: "Required." }}><TextField label="Name" name="name" /></EditSheet>;
export const editSheet04 = <EditSheet title="Edit recipe" isOpen={open} onClose={() => setOpen(false)} onSubmit={save}><TextField label="Name" name="name" /></EditSheet>;
export const okEditSheet = <EditSheet title="Edit recipe" open={open} onOpenChange={setOpen} onSubmit={save} submitLabel="Save recipe"><TextField label="Name" name="name" /></EditSheet>;
