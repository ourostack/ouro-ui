// What agents write with field: snippets whose cases are in field.cases.ts.
import { Field } from "@/registry/ouro/components/ouro/field/field";
import { FieldControl } from "@/registry/ouro/components/ouro/field/field-parts";

export const s32 = <Field label="Email" htmlFor="email"><FieldControl /></Field>;
export const s33 = <Field label="Email" errorMessage="Required."><FieldControl /></Field>;
export const s34 = <Field label="Email" helperText="We never share it."><FieldControl /></Field>;
export const s35 = <Field label="Email" isInvalid><FieldControl /></Field>;
export const s36 = <Field label="Email" isRequired><FieldControl /></Field>;
export const s37 = <Field label="Email" isDisabled><FieldControl /></Field>;
export const s38 = <Field placeholder="Email"><FieldControl /></Field>;
export const ok08 = <Field label="Email" name="email" required description="We never share it." error="Required."><FieldControl /></Field>;
