import { useState, type FormEvent, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Form, type FormErrors } from "@/registry/ouro/components/ouro/form/form";
import { Select } from "@/registry/ouro/components/ouro/select/select";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { formErrors } from "@/registry/ouro/lib/ouro/form-errors";

// The live demo at the top of docs/form/: the component as an app would use it, with its props, nothing else.

const courses = [
  { value: "starter", label: "Starter" },
  { value: "main", label: "Main" },
  { value: "dessert", label: "Dessert" },
];

export default function FormDemo(): JSX.Element {
  const [answer, setAnswer] = useState<{ errors: FormErrors | undefined }>();
  // Stands in for the server: it rejects one name, the way an action returns errors.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setAnswer({ errors: data.get("name") === "Pasta" ? { name: "A recipe called Pasta already exists." } : undefined });
  };
  return (
    <Form className="w-full max-w-sm" errors={formErrors(answer, answer?.errors)} onSubmit={submit}>
      <TextField label="Recipe name" name="name" required defaultValue="Pasta" />
      <Select label="Course" name="course" placeholder="Choose a course" required options={courses} />
      <Button type="submit">Save recipe</Button>
    </Form>
  );
}
