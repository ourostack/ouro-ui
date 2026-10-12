// What agents write with otp-field: snippets whose cases are in otp-field.cases.ts.
import { OtpField } from "@/registry/ouro/components/ouro/otp-field/otp-field";

export const otpField01 = <OtpField label="Code" maxLength={6} />;
export const otpField02 = <OtpField label="Code" onComplete={() => {}} />;
export const otpField03 = <OtpField label="Code" numInputs={4} />;
export const otpFieldOk = <OtpField label="Code" name="code" length={6} groupSize={3} autoSubmit required error="Expired." />;
