// What agents write with radio-group: snippets whose cases are in radio-group.cases.ts.
import { Radio, RadioGroup } from "@/registry/ouro/components/ouro/radio-group/radio-group";

const sizes = [{ value: "small", label: "Small" }];

export const radioGroup01 = <RadioGroup label="Size" legend="Size" options={sizes} />;
export const radioGroup02 = <RadioGroup legend="Size" onChange={() => {}} options={sizes} />;
export const radioGroup03 = <RadioGroup legend="Size"><Radio value="small" label="Small" checked /></RadioGroup>;
export const radioGroupOk01 = <RadioGroup legend="Size" name="size" required orientation="horizontal" defaultValue="small" options={sizes} />;
