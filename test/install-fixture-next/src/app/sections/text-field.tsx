import { TextField } from "@/components/ouro/text-field/text-field";

// expect: Ouro text field
// expect: Text field description
// expect: Show password
// TextField's description and text adornment ids, through Field, in the server HTML.
// expect: aria-describedby="[^"]*-description [^"]*-start"
export default function TextFieldSection() {
  return (
    <>
      <TextField label="Ouro text field" type="email" name="contact" description="Text field description" startAdornment="@" clearable defaultValue="ari" />
      <TextField label="Ouro password" type="password" name="password" />
    </>
  );
}
