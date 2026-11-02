import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { LiveCaptions, type LiveCaptionLine } from "@/registry/ouro/components/ouro/live-captions/live-captions";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names). Gradients stand
// in for a call's video, and the band sits in its own space under them, never over a face.

/** A call stage: two people's pictures, and under them whatever the stage puts there (the band). */
function Stage({ children }: { children: ReactNode }) {
  const picture = (name: string, stop: string) => (
    <div
      role="img"
      aria-label={`${name}'s video`}
      style={{
        aspectRatio: "16 / 9",
        borderRadius: "calc(var(--radius) + 4px)",
        background: `linear-gradient(135deg, var(--muted), ${stop} 60%, var(--background))`,
      }}
    />
  );
  return (
    <div style={{ maxWidth: 640, display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {picture("Mara Lind", "var(--primary)")}
        {picture("Jonas Ek", "color-mix(in oklab, var(--primary) 50%, var(--foreground))")}
      </div>
      {children}
    </div>
  );
}

const meeting: LiveCaptionLine[] = [
  { id: "m1", speaker: "Mara Lind", text: "Shall we start with the plan for next week?", final: true },
  { id: "m2", speaker: "Jonas Ek", text: "Yes, and then the budget, if there is time", final: false },
];

const meta = {
  title: "Display/LiveCaptions",
  component: LiveCaptions,
  parameters: { layout: "padded" },
  args: { label: "Captions", lines: meeting },
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    maxLines: { control: { type: "range", min: 1, max: 6, step: 1 } },
    lines: { control: "object" },
  },
} satisfies Meta<typeof LiveCaptions>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/**
 * In a call, under the pictures: a final line and an interim one (muted) under it. Then the band
 * before anyone speaks, with its quiet placeholder line, and in a meeting without captions.
 */
export const States: Story = {
  parameters: { screenshot: { name: "live-captions-states" } },
  render: () => (
    <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
      <Stage>
        <LiveCaptions label="Captions" hideLabel lines={meeting} />
      </Stage>
      <LiveCaptions label="Captions before anyone speaks" hideLabel lines={[]} />
      <LiveCaptions label="Captions in a meeting without them" hideLabel lines={[]} unavailable="Captions aren't available in this meeting" />
    </div>
  ),
};

/** With the label shown over the lines, for a band outside a call, such as under a video. */
export const Labelled: Story = {
  render: () => (
    <div style={{ maxWidth: 640 }}>
      <LiveCaptions label="Captions" lines={meeting} />
    </div>
  ),
};

/** Turned on in a quiet moment: a muted line says captions are on, until someone speaks. */
export const Waiting: Story = {
  render: () => (
    <Stage>
      <LiveCaptions label="Captions" hideLabel lines={[]} />
    </Stage>
  ),
};

/** In a meeting that doesn't offer captions, the band says so with `unavailable`, at the same height. */
export const Unavailable: Story = {
  render: () => (
    <Stage>
      <LiveCaptions label="Captions" hideLabel lines={[]} unavailable="Captions aren't available in this meeting" />
    </Stage>
  ),
};

/** Who says what, word by word: each line arrives interim and firms up, as a caption service sends it. */
const script: Array<Pick<LiveCaptionLine, "speaker" | "text">> = [
  { speaker: "Mara Lind", text: "Shall we start with the plan for next week?" },
  { speaker: "Jonas Ek", text: "Yes, and then the budget, if there is time." },
  { speaker: "Mara Lind", text: "Good. The launch moves to Thursday." },
  { speaker: "Jonas Ek", text: "Thursday works for the whole team." },
];

/** Plays the script on a loop: a few words at a time, interim, then final. */
function useScript(): LiveCaptionLine[] {
  const [lines, setLines] = useState<LiveCaptionLine[]>([]);
  useEffect(() => {
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const index = Math.floor(step / 8);
      const { speaker, text } = script[index % script.length]!;
      const words = text.split(" ");
      const shown = Math.min(words.length, ((step % 8) + 1) * 2);
      const final = step % 8 === 7;
      const line = { id: `live-${index}`, speaker, text: words.slice(0, shown).join(" "), final };
      setLines((current) => [...current.filter((existing) => existing.id !== line.id), line].slice(-8));
      step += 1;
      timer = setTimeout(tick, final ? 900 : 350);
    };
    timer = setTimeout(tick, 350);
    return () => clearTimeout(timer);
  }, []);
  return lines;
}

function LiveBand() {
  return <LiveCaptions label="Captions" hideLabel lines={useScript()} />;
}

/** A live sequence: words arrive muted, turn white when final, and older lines slide up and off. */
export const Live: Story = {
  render: () => (
    <Stage>
      <LiveBand />
    </Stage>
  ),
};

/** The three sizes the person can choose: 14, 18 and 24px words. */
export const Sizes: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
      <LiveCaptions label="Small captions" size="sm" lines={meeting} />
      <LiveCaptions label="Medium captions" size="md" lines={meeting} />
      <LiveCaptions label="Large captions" size="lg" lines={meeting} />
    </div>
  ),
};

function NextLine({ announce }: { announce?: boolean }) {
  const [count, setCount] = useState(1);
  const lines = Array.from({ length: count }, (_, index) => ({ id: `next-${index}`, ...script[index % script.length]!, final: true }));
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Stage>
        <LiveCaptions label="Captions" hideLabel lines={lines} announce={announce} />
      </Stage>
      <div>
        <Button variant="outline" tone="secondary" onClick={() => setCount((current) => current + 1)}>
          Say the next line
        </Button>
      </div>
    </div>
  );
}

/** With reduced motion (here through `OuroProvider motion="reduced"`), older lines leave the top at once instead of sliding. */
export const ReducedMotion: Story = {
  render: () => (
    <OuroProvider motion="reduced">
      <NextLine />
    </OuroProvider>
  ),
};

/** With `announce`, each line is read aloud once, when it becomes final, at most once every 2 seconds. */
export const ReadAloud: Story = {
  parameters: { conformance: { announces: { "Say the next line": "Jonas Ek: Yes, and then the budget, if there is time." } } },
  render: () => <NextLine announce />,
};
