import type { Meta, StoryObj } from "@storybook/react-vite";
import { ListDetailPage } from "@/registry/ouro/patterns/list-detail-page/list-detail-page";

// Repository-only: a page pattern as an app installs it, whole, so the shared suites and the
// screen-reader lane meet it as a person does. The patterns ship as registry:block items with no stories.

const meta = {
  title: "Reference/Patterns",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;

type Story = StoryObj<typeof meta>;

/** A searchable list beside the detail of the entry chosen; on a phone, the detail in the list's place. */
export const ListDetail: Story = { render: () => <ListDetailPage /> };
