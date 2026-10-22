import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { MeetingRow } from "@/registry/ouro/components/ouro/meeting-row/meeting-row";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--background)", color: "var(--foreground)", padding: 8, display: "grid", gap: 4, maxWidth: 420 }}>{children}</div>
  );
}

const meta = {
  title: "Lists/MeetingRow",
  component: MeetingRow,
  parameters: { layout: "padded" },
  args: { title: "Weekly sync", time: "10:00", duration: "30 min", state: "upcoming", detail: "Ada Lovelace" },
  argTypes: {
    state: { control: "inline-radio", options: ["past", "now", "upcoming"] },
    statusTone: { control: "inline-radio", options: ["primary", "secondary", "destructive", "success", "warning"] },
  },
} satisfies Meta<typeof MeetingRow>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <MeetingRow {...args} />
    </Surface>
  ),
};

/** A day's agenda: a past meeting is quieter, the current one is called out, and later ones wait. */
export const Agenda: Story = {
  render: () => (
    <Surface>
      <MeetingRow title="Standup" time="09:00" dateTime="2026-06-01T09:00" duration="15 min" state="past" detail="Grace Hopper" />
      <MeetingRow
        title="Weekly sync"
        time="10:00"
        dateTime="2026-06-01T10:00"
        duration="30 min"
        state="now"
        status="Organizer"
        statusTone="primary"
        detail="Started 5 min ago"
        actions={
          <>
            <Button size="sm">Join</Button>
            <Button size="sm" variant="outline">
              Chat
            </Button>
          </>
        }
      />
      <MeetingRow title="Design review" time="13:30" dateTime="2026-06-01T13:30" duration="1 h" state="upcoming" status="Tentative" statusTone="warning" detail="Room 4" />
      <MeetingRow title="Garden club planning" time="17:00" dateTime="2026-06-01T17:00" duration="45 min" state="upcoming" status="Declined" statusTone="destructive" />
    </Surface>
  ),
};
