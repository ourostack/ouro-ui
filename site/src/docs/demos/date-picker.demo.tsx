import { type JSX } from "react";
import { DatePicker } from "@/registry/ouro/components/ouro/calendar/date-picker";

// The live demo at the top of docs/date-picker/: the component as an app would use it, with its props, nothing else.

export default function DatePickerDemo(): JSX.Element {
  return (
    <form className="grid w-full max-w-sm gap-4" onSubmit={(event) => event.preventDefault()}>
      <DatePicker label="Delivery date" name="delivery" required description="Type it, or choose it in the calendar." />
    </form>
  );
}
