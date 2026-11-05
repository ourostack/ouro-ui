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
  args: { label: "Microphone level", value: 0.03 },
  argTypes: {
    value: { control: { type: "range", min: 0, max: 0.3, step: 0.001 } },
    bars: { control: { type: "range", min: 3, max: 24, step: 1 } },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    tone: { control: "inline-radio", options: ["success", "primary", "secondary", "destructive", "warning"] },
  },
} satisfies Meta<typeof LevelMeter>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. `value` is a linear amplitude: 0.03 is about -30 dBFS, ordinary speech. */
export const Playground: Story = {};

/**
 * Silence, ordinary speech (about -30 dBFS), a loud voice (about -6 dBFS) and a muted microphone
 * hearing ordinary speech, the three sizes, a tone, and one with a hidden label.
 */
export const States: Story = {
  parameters: { screenshot: { name: "level-meter-states" } },
  render: () => (
    <Surface>
      <LevelMeter label="Silent microphone" value={0} />
      <LevelMeter label="Microphone level" value={0.0316} />
      <LevelMeter label="Loud microphone" value={0.5} />
      <LevelMeter label="Muted microphone" muted value={0.0316} />
      <LevelMeter label="Small meter" size="sm" bars={5} value={0.06} />
      <LevelMeter label="Large meter" size="lg" bars={12} value={0.01} />
      <LevelMeter label="Primary tone" tone="primary" value={0.06} />
      <LevelMeter label="Hidden label" hideLabel value={0.0316} />
    </Surface>
  ),
};

/**
 * A made-up voice's amplitude at a moment, as an analyser's RMS would give it: syllables between
 * about -50 and -18 dBFS, with short pauses near silence.
 */
function voice(time: number): number {
  const syllables = Math.abs(Math.sin(time * 7.3)) * (0.55 + 0.45 * Math.sin(time * 1.7));
  const speaking = Math.sin(time * 0.9) > -0.6;
  return 0.0005 + 0.12 * syllables * (speaking ? 1 : 0.005);
}

function Talking() {
  const [rms, setRms] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => setRms(voice((performance.now() - start) / 1000)), 1000 / 15);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <LevelMeter label="Microphone level" value={rms} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 14 }}>In a menu row</span>
        <LevelMeter label="Microphone level in a menu" hideLabel size="sm" bars={5} value={rms} />
      </div>
    </>
  );
}

/** A made-up voice at 15 amplitudes a second, as an app's audio analyser would feed it, to see the bars rise and fall. */
export const Live: Story = {
  render: () => (
    <Surface>
      <Talking />
    </Surface>
  ),
};
