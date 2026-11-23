import type { Meta, StoryObj } from "@storybook/react-vite";
import { DashboardPage } from "@/registry/ouro/patterns/dashboard-page/dashboard-page";
import { ListDetailPage } from "@/registry/ouro/patterns/list-detail-page/list-detail-page";
import { SettingsPage } from "@/registry/ouro/patterns/settings-page/settings-page";

// Repository-only: the page patterns as an app installs them, whole, so the shared suites and the
// screen-reader lane meet them as a person does. The patterns ship as registry:block items with no stories.

const meta = {
  title: "Reference/Patterns",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;

type Story = StoryObj<typeof meta>;

/** A searchable list beside the detail of the entry chosen; on a phone, the detail in the list's place. */
export const ListDetail: Story = { render: () => <ListDetailPage /> };

/** The numbers that matter in cards, a chart of the last months and a table of recent activity. */
export const Dashboard: Story = { render: () => <DashboardPage /> };

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A settings form the browser validates, with a confirmation before the destructive action. It starts with a made-up
 * account and takes a moment to save, so the first Save shows the busy and saved states instead of only errors.
 */
export const Settings: Story = {
  render: () => (
    <SettingsPage
      initial={{ name: "Ada Lovelace", email: "ada@example.com", language: "en", notifications: true }}
      onSave={() => pause(800)}
      onDelete={() => pause(800)}
    />
  ),
};
