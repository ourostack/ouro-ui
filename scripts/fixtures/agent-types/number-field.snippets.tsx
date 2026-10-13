// What agents write with number-field: snippets whose cases are in number-field.cases.ts.
import { NumberField } from "@/registry/ouro/components/ouro/number-field/number-field";

export const numberField01 = <NumberField label="Servings" minValue={1} />;
export const numberField02 = <NumberField label="Price" formatOptions={{ style: "currency", currency: "USD" }} />;
export const numberField03 = <NumberField label="Weight" precision={2} />;
export const numberField04 = <NumberField label="Servings" type="number" />;
export const numberFieldOk01 = <NumberField label="Price" name="price" defaultValue={4.5} min={0} step={0.5} format={{ style: "currency", currency: "USD" }} required />;
