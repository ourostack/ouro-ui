// What agents write with date-picker: snippets whose cases are in date-picker.cases.ts.
import { DatePicker } from "@/registry/ouro/components/ouro/calendar/date-picker";

const setDate = (date: string): void => void date;

export const datePicker01 = <DatePicker label="Date" onChange={setDate} />;
export const datePicker02 = <DatePicker label="Date" dateFormat="dd/MM/yyyy" />;
export const datePicker03 = <DatePicker label="Date" helperText="Weekdays only." />;
export const datePickerOk01 = <DatePicker label="Delivery date" name="delivery" value="2026-10-11" onValueChange={setDate} min="2026-10-01" required error="Pick a date." locale="en-GB" chooseDateLabel="Choose date" />;
