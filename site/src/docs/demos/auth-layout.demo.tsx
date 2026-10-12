import { type JSX } from "react";
import { AuthLayout } from "@/registry/ouro/components/ouro/auth-layout/auth-layout";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Form } from "@/registry/ouro/components/ouro/form/form";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";

// The live demo at the top of docs/auth-layout/: the component as an app would use it, with its props, nothing else.
// The layout fills the screen in an app; here a shorter frame holds it.

export default function AuthLayoutDemo(): JSX.Element {
  return (
    <AuthLayout
      className="min-h-[34rem] w-full"
      title="Sign in"
      description="Welcome back to your kitchen."
      footer={
        <>
          New here? <Link href="#signup">Create an account</Link>
        </>
      }
    >
      <Form className="grid gap-4" onSubmit={(event) => event.preventDefault()}>
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
        <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
        <Button type="submit" fullWidth>
          Sign in
        </Button>
      </Form>
    </AuthLayout>
  );
}
