// What agents write with checkbox: snippets whose cases are in checkbox.cases.ts.
import { Checkbox } from "@/registry/ouro/components/ouro/checkbox/checkbox";

export const checkbox01 = <Checkbox label="Basil" onChange={() => {}} />;
export const checkbox02 = <Checkbox label="Basil" isChecked />;
export const checkbox03 = <Checkbox label="Basil" defaultValue />;
export const checkboxOk01 = <Checkbox label="I accept the terms" name="terms" required error="Accept the terms." description="Read them first." defaultChecked />;
