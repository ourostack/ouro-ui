import { type AgentCase, hint } from "./shared.ts";

/** The otp-field snippets in otp-field.snippets.tsx that make mistakes, in file order. */
export const agentCases: AgentCase[] = [
  { id: "otpField01", habit: "shadcn InputOTP's maxLength", tsc: [hint("number", "Use <OtpField length={6}>")], dev: "<OtpField length={6}>", names: ["tsc", "dev"] },
  {
    id: "otpField02",
    habit: "an onComplete callback",
    tsc: [hint("() => void", "Use <OtpField onValueComplete={(code) => ...}>")],
    dev: "<OtpField onValueComplete={(code) => …}>",
    names: ["tsc", "dev"],
  },
  { id: "otpField03", habit: "react-otp-input's numInputs", tsc: [hint("number", "Use <OtpField length={4}>")], dev: "<OtpField length={4}>", names: ["tsc", "dev"] },
];

/** Valid otp-field snippets: no type error, no development message, and hover on every prop. */
export const validSnippets: string[] = ["otpFieldOk"];
