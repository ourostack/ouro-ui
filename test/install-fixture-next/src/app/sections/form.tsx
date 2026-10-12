import { Form } from "@/components/ouro/form/form";
import { Select } from "@/components/ouro/select/select";
import { TextField } from "@/components/ouro/text-field/text-field";

// expect: Ouro form email
// expect: That email is taken.
// expect: Choose a course.
// Form's errors reach their fields in the server HTML: marked invalid and linked by id.
// expect: aria-invalid="true"
// expect: aria-describedby="[^"]*-error"
export default function FormSection() {
  return (
    <Form method="post" errors={{ "form-email": "That email is taken.", "form-course": "Choose a course." }}>
      <TextField label="Ouro form email" name="form-email" type="email" />
      <Select label="Ouro form course" name="form-course" options={[{ value: "main", label: "Main" }]} />
    </Form>
  );
}
