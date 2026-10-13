import { AuthLayout } from "@/components/ouro/auth-layout/auth-layout";

// expect: data-ouro="auth-layout"
// The title is the page's h1, inside a Card.
// expect: <h1[^>]*>Ouro auth layout</h1>
// expect: Ouro auth layout form
// expect: Ouro auth layout footer
export default function AuthLayoutSection() {
  return (
    <AuthLayout title="Ouro auth layout" description="Rendered by a Server Component" footer="Ouro auth layout footer">
      <p>Ouro auth layout form</p>
    </AuthLayout>
  );
}
