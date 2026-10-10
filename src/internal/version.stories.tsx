import type { Meta, StoryObj } from "@storybook/react-vite";
import { version } from "./version";

// Placeholder story so Storybook has something to build before the first
// component lands. Removed in the Button task.
function Version() {
  return <p>@ouro.bot/ui {version}</p>;
}

const meta = { title: "Internal/Version", component: Version } satisfies Meta<typeof Version>;
export default meta;

export const Default: StoryObj<typeof meta> = {};
