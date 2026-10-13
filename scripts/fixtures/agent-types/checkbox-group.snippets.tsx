// What agents write with checkbox-group: snippets whose cases are in checkbox-group.cases.ts.
import { CheckboxGroup } from "@/registry/ouro/components/ouro/checkbox/checkbox-group";

const herbs = [{ value: "basil", label: "Basil" }];

export const checkboxGroup01 = <CheckboxGroup label="Herbs" legend="Herbs" options={herbs} />;
export const checkboxGroup02 = <CheckboxGroup legend="Herbs" items={herbs} options={herbs} />;
export const checkboxGroupOk01 = <CheckboxGroup legend="Herbs" name="herbs" required error="Pick one." defaultValue={["basil"]} options={herbs} />;
