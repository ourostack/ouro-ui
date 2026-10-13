import { DatePicker } from "@/components/ouro/calendar/date-picker";

// expect: Ouro date picker
// expect: Date picker description
// expect: Choose date
// The ISO value the form submits, and the description and error ids, in the server HTML.
// expect: type="hidden" name="ouro-date" value="2026-10-11"
// expect: aria-describedby="[^"]*-description [^"]*-error"
// expect: aria-invalid="true"
export default function DatePickerSection() {
  return (
    <DatePicker
      label="Ouro date picker"
      name="ouro-date"
      defaultValue="2026-10-11"
      description="Date picker description"
      error="Date picker error"
    />
  );
}
