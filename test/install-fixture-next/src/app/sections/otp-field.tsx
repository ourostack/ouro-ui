import { OtpField } from "@/components/ouro/otp-field/otp-field";

// expect: Ouro OTP field
// expect: Ouro OTP description
// React writes the attribute as autoComplete in the server HTML.
// expect: autoComplete="one-time-code"
// OtpField's description id, through Field, on the slots' group in the server HTML.
// expect: aria-describedby="[^"]*-description"
export default function OtpFieldSection() {
  return <OtpField label="Ouro OTP field" name="code" description="Ouro OTP description" length={4} />;
}
