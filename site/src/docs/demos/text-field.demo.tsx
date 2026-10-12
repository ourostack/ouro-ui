import { type JSX } from "react";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";

// The live demo at the top of docs/text-field/: the component as an app would use it, with its props, nothing else.

export default function TextFieldDemo(): JSX.Element {
  return (
    <form className="grid w-full max-w-sm gap-4" onSubmit={(event) => event.preventDefault()}>
      <TextField label="Email" type="email" name="email" required placeholder="you@example.com" />
      <TextField label="Password" type="password" name="password" autoComplete="new-password" description="8 or more characters." />
      <TextField label="Price" name="price" inputMode="decimal" startAdornment="$" endAdornment="per jar" clearable defaultValue="4.50" />
    </form>
  );
}
