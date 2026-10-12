import { type JSX } from "react";
import { FileField } from "@/registry/ouro/components/ouro/file-field/file-field";

// The live demo at the top of docs/file-field/: the component as an app would use it, with its props, nothing else.

export default function FileFieldDemo(): JSX.Element {
  return (
    <form className="grid w-full max-w-sm gap-4" onSubmit={(event) => event.preventDefault()}>
      <FileField label="Recipe photos" name="photos" accept="image/*" multiple maxSize={5 * 1024 * 1024} description="Up to 5 MB each." />
    </form>
  );
}
