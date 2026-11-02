import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState, type ReactNode } from "react";
import { LevelMeter } from "@/registry/ouro/components/ouro/level-meter/level-meter";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

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
        gap: 20,
        maxWidth: 420,
      }}
    >
      {children}
    </div>
  );
}

const meta = {
  title: "Feedback/LevelMeter",
  component: LevelMeter,
  parameters: { layout: "padded" },
  args: { label: "Microphone level", value: 0.4 },
  argTypes: {
    value: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    bars: { control: { type: "range", min: 3, max: 24, step: 1 } },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    tone: { control: "inline-radio", options: ["success", "primary", "secondary", "destructive", "warning"] },
  },
} satisfies Meta<typeof LevelMeter>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** Silent, speaking and loud meters, the three sizes, a tone, and one with a hidden label. */
export const States: Story = {
  parameters: { screenshot: { name: "level-meter-states" } },
  render: () => (
    <Surface>
      <LevelMeter label="Silent microphone" value={0} />
      <LevelMeter label="Microphone level" value={0.45} />
      <LevelMeter label="Loud microphone" value={0.9} />
      <LevelMeter label="Small meter" size="sm" bars={5} value={0.6} />
      <LevelMeter label="Large meter" size="lg" bars={12} value={0.3} />
      <LevelMeter label="Primary tone" tone="primary" value={0.6} />
      <LevelMeter label="Hidden label" hideLabel value={0.5} />
    </Surface>
  ),
};

/** A voice-like level at a moment: syllables rising and falling, with short pauses. */
function voice(time: number): number {
  const syllables = Math.abs(Math.sin(time * 7.3)) * (0.55 + 0.45 * Math.sin(time * 1.7));
  return Math.max(0, Math.min(1, syllables * (Math.sin(time * 0.9) > -0.6 ? 1 : 0.05)));
}

function Talking() {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => setLevel(voice((performance.now() - start) / 1000)), 1000 / 15);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <LevelMeter label="Microphone level" value={level} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 14 }}>In a menu row</span>
        <LevelMeter label="Microphone level in a menu" hideLabel size="sm" bars={5} value={level} />
      </div>
    </>
  );
}

/** A made-up voice at 15 levels a second, as an app's audio analyser would feed it, to see the bars move. */
export const Live: Story = {
  render: () => (
    <Surface>
      <Talking />
    </Surface>
  ),
};
