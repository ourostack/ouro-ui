import { type JSX } from "react";
import { OtpField } from "@/registry/ouro/components/ouro/otp-field/otp-field";

// The live demo at the top of docs/otp-field/: the component as an app would use it, with its props, nothing else.

export default function OtpFieldDemo(): JSX.Element {
  return (
    <form className="grid w-full max-w-sm gap-4" onSubmit={(event) => event.preventDefault()}>
      <OtpField label="Verification code" name="code" groupSize={3} description="We sent a 6-digit code to your phone." />
    </form>
  );
}
