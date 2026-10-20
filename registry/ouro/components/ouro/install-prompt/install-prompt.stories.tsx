import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import { InstallPrompt } from "@/registry/ouro/components/ouro/install-prompt/install-prompt";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

/**
 * Storybook is not an installable app, so the browser never offers to install it: this fires
 * the offer the browser fires for an app with a manifest, with a dialog that answers "dismissed".
 */
function useSimulatedOffer() {
  useEffect(() => {
    localStorage.removeItem("ouro-install-dismissed");
    const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: () => Promise.resolve(),
      userChoice: Promise.resolve({ outcome: "dismissed" as const }),
    });
    window.dispatchEvent(offer);
  }, []);
}

const meta = {
  title: "Feedback/InstallPrompt",
  component: InstallPrompt,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => {
      useSimulatedOffer();
      return (
        <div style={{ maxWidth: 420 }}>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof InstallPrompt>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. Install opens the browser's dialog; Not now hides the offer for two weeks. */
export const Playground: Story = {};

/** Where an app puts it: under the content on its home page, in its own words. */
export const InContext: Story = {
  args: {
    title: "Take your notes offline",
    description: "Install Field Notes to read and write notes without a connection.",
    installLabel: "Install Field Notes",
  },
};
