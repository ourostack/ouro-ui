import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { LiveCaptions, type LiveCaptionLine } from "@/registry/ouro/components/ouro/live-captions/live-captions";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names). The "picture"
// behind each band is a gradient standing in for a call's video.

function Picture({ children, width = 640 }: { children: ReactNode; width?: number }) {
  return (
    <div
      style={{
        maxWidth: width,
        borderRadius: "calc(var(--radius) + 4px)",
        padding: 16,
        display: "grid",
        gap: 16,
        alignContent: "end",
        minHeight: 200,
        background: "linear-gradient(135deg, var(--muted), var(--primary) 60%, var(--background))",
      }}
    >
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

/** A final line and an interim one (muted) under it, over a picture, with the label shown. */
export const States: Story = {
  parameters: { screenshot: { name: "live-captions-states" } },
  render: () => (
    <Picture>
      <LiveCaptions label="Captions" lines={meeting} />
    </Picture>
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
    <Picture>
      <LiveBand />
    </Picture>
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
      <Picture>
        <LiveCaptions label="Captions" lines={lines} announce={announce} />
      </Picture>
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
