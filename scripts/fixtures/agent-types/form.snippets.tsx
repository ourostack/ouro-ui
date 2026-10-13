// What agents write with form: snippets whose cases are in form.cases.ts.
import { Form } from "@/registry/ouro/components/ouro/form/form";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { formErrors } from "@/registry/ouro/lib/ouro/form-errors";

export const form01 = <Form validationErrors={{ email: "Taken." }}><TextField label="Email" name="email" /></Form>;
export const form02 = <Form result={{ errors: {} }}><TextField label="Email" name="email" /></Form>;
export const okForm = <Form errors={{ email: "Taken." }}><TextField label="Email" name="email" /></Form>;
export const okFormAnswer = <Form errors={formErrors({}, { email: "Taken." })}><TextField label="Email" name="email" /></Form>;
