// What agents write with color-field: snippets whose cases are in color-field.cases.ts.
import { ColorField } from "@/registry/ouro/components/ouro/color-field/color-field";

export const colorField01 = <ColorField label="Color" color="#ff0000" />;
export const colorField02 = <ColorField label="Color" format="rgb" />;
export const colorFieldOk = <ColorField label="Color" name="color" defaultValue="#3366ff" required />;
