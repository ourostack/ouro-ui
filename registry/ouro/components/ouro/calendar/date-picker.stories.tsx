import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties, type ReactNode } from "react";
import { DatePicker } from "@/registry/ouro/components/ouro/calendar/date-picker";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names). The stories
// use March 2026, a month that has passed, so today's mark never moves a screenshot.

const caption: CSSProperties = { margin: 0, fontSize: "12px", lineHeight: "16px", color: "var(--muted-foreground)" };

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
  title: "Forms/DatePicker",
  component: DatePicker,
  parameters: { layout: "padded" },
  args: { label: "Delivery date", name: "delivery", defaultValue: "2026-03-12", description: "Type it, or choose it in the calendar." },
  argTypes: {
    locale: { control: "inline-radio", options: ["en-US", "en-GB", "de-DE"] },
    required: { control: "boolean" },
    disabled: { control: "boolean" },
    error: { control: "text" },
  },
  render: (args) => (
    <Surface>
      <DatePicker {...args} />
    </Surface>
  ),
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A text box and a calendar button with a mouse or trackpad; the phone's own picker on a touch screen. */
export const Playground: Story = {
  parameters: { screenshot: { name: "date-picker-open", open: true } },
};

/** `error`, `required` and `min`/`max` work as on every Ouro field. */
export const States: Story = {
  render: () => (
    <Surface>
      <DatePicker label="Delivery date" required error="Pick a weekday." defaultValue="2026-03-14" />
      <DatePicker label="Start date" min="2026-03-02" max="2026-03-27" defaultValue="2026-03-02" />
    </Surface>
  ),
  parameters: { screenshot: { name: "date-picker-states" } },
};

/** Controlled: `value` and `onValueChange` hold the ISO date the form submits. */
export const Controlled: Story = {
  render: function Render() {
    const [date, setDate] = useState("2026-03-12");
    return (
      <Surface>
        <DatePicker label="Delivery date" locale="en-GB" value={date} onValueChange={setDate} />
        <p style={caption}>Submits: {date === "" ? "(empty)" : date}</p>
      </Surface>
    );
  },
};

/** In a form: the submit shows the FormData, the ISO date under `name` on either path. */
export const InForm: Story = {
  render: function Render() {
    const [sent, setSent] = useState("");
    return (
      <Surface>
        <form
          style={{ display: "grid", gap: 16 }}
          onSubmit={(event) => {
            event.preventDefault();
            setSent(JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))));
          }}
        >
          <DatePicker label="Delivery date" name="delivery" defaultValue="2026-03-07" />
          <button type="submit" data-test-harness="" style={{ justifySelf: "start" }}>
            Submit
          </button>
        </form>
        <output style={caption}>{sent}</output>
      </Surface>
    );
  },
};
