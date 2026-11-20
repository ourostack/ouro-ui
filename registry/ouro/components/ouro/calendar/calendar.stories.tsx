import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties } from "react";
import { Calendar, type DateRange } from "@/registry/ouro/components/ouro/calendar/calendar";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names). The stories
// show March 2026, a month that has passed, so today's mark never moves a screenshot.

const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start" };
const caption: CSSProperties = { margin: "8px 0 0", fontSize: "12px", lineHeight: "16px", color: "var(--muted-foreground)" };

const meta = {
  title: "Forms/Calendar",
  component: Calendar,
  parameters: { layout: "centered" },
  args: { label: "Delivery date", defaultValue: "2026-03-12" },
  argTypes: {
    locale: { control: "inline-radio", options: ["en-US", "en-GB", "de-DE", "ja-JP", "ar-EG"] },
  },
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One day, picked with a press or the arrow keys. */
export const Playground: Story = {
  parameters: { screenshot: { name: "calendar" } },
};

/** `range` picks a start and an end; the days between preview as you point or move. */
export const Range: Story = {
  args: { label: "Trip" },
  render: function Render() {
    const [trip, setTrip] = useState<DateRange | null>({ start: "2026-03-09", end: "2026-03-13" });
    return (
      <div>
        <Calendar label="Trip" range value={trip} onValueChange={setTrip} />
        <p style={caption}>{trip ? `${trip.start} to ${trip.end}` : "No dates"}</p>
      </div>
    );
  },
  parameters: { screenshot: { name: "calendar-range" } },
};

/** `min`, `max` and `isDateDisabled` make days unavailable; weekends here. */
export const Unavailable: Story = {
  args: {
    min: "2026-03-04",
    max: "2026-03-27",
    isDateDisabled: (date: string) => [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()),
  },
};

/** The locale sets the names, the digits and the first day of the week. */
export const Locales: Story = {
  render: () => (
    <div style={row}>
      <Calendar label="Delivery date" defaultValue="2026-03-12" locale="en-GB" />
      <Calendar label="Liefertermin" defaultValue="2026-03-12" locale="de-DE" previousMonthLabel="Vorheriger Monat" nextMonthLabel="Nächster Monat" />
      <Calendar label="配達日" defaultValue="2026-03-12" locale="ja-JP" previousMonthLabel="前の月" nextMonthLabel="次の月" />
    </div>
  ),
};
