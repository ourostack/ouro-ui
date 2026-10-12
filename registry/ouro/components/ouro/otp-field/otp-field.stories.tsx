import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { OtpField } from "@/registry/ouro/components/ouro/otp-field/otp-field";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        padding: 24,
        display: "grid",
        gap: 24,
        maxWidth: 420,
      }}
    >
      {children}
    </div>
  );
}

const meta = {
  title: "Forms/OtpField",
  component: OtpField,
  parameters: { layout: "padded" },
  args: { label: "Verification code", name: "code", description: "We sent a 6-digit code to your phone." },
  argTypes: {
    length: { control: "number" },
    groupSize: { control: "number" },
    validationType: { control: "inline-radio", options: ["numeric", "alpha", "alphanumeric"] },
    mask: { control: "boolean" },
    required: { control: "boolean" },
    disabled: { control: "boolean" },
    hideLabel: { control: "boolean" },
    error: { control: "text" },
  },
} satisfies Meta<typeof OtpField>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. Paste a code into any slot to fill them all. */
export const Playground: Story = {};

/** Empty, grouped and filled, letters and numbers, invalid, and disabled. */
export const States: Story = {
  parameters: { screenshot: { name: "otp-field-states" } },
  render: () => (
    <Surface>
      <OtpField label="Verification code" name="code" description="We sent it to your phone." />
      <OtpField label="Sign-in code" name="signin" groupSize={3} defaultValue="4821" />
      <OtpField label="Recovery code" name="recovery" validationType="alphanumeric" length={8} groupSize={4} defaultValue="AB12CD34" />
      <OtpField label="PIN" name="pin" length={4} mask defaultValue="1234" error="That PIN is not right. Try again." />
      <OtpField label="Old code" name="old" length={4} disabled defaultValue="0000" />
    </Surface>
  ),
};
