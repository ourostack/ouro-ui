import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { SnapPiP, type SnapPiPCorner } from "@/registry/ouro/components/ouro/snap-pip/snap-pip";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names). The "video" is a
// made-up gradient: SnapPiP renders no media of its own.

/** A call's stage: someone else's picture, as a gradient, with their name. */
function Stage({ children, band, name }: { children: ReactNode; band?: RefObject<HTMLDivElement | null>; name?: RefObject<HTMLParagraphElement | null> }) {
  return (
    <div
      data-testid="stage"
      style={{
        position: "relative",
        height: 420,
        overflow: "hidden",
        borderRadius: "calc(var(--radius) + 4px)",
        background: "radial-gradient(circle at 40% 35%, oklch(0.72 0.09 60), oklch(0.42 0.07 30) 55%, oklch(0.24 0.04 260))",
        color: "white",
      }}
    >
      <p ref={name} style={{ position: "absolute", insetBlockStart: 16, insetInlineStart: 16, margin: 0, padding: "4px 10px", borderRadius: 999, background: "oklch(0 0 0 / 0.6)", fontSize: 14 }}>
        Mara Lind
      </p>
      {band ? (
        <div
          ref={band}
          data-testid="controls-band"
          style={{
            position: "absolute",
            insetInline: 0,
            insetBlockEnd: 0,
            height: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "oklch(0 0 0 / 0.55)",
            fontSize: 14,
          }}
        >
          Call controls
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** The person's own picture, as a gradient. */
function SelfView() {
  return <div aria-hidden="true" style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, oklch(0.78 0.08 200), oklch(0.5 0.1 250))" }} />;
}

const meta = {
  title: "Layout/SnapPiP",
  component: SnapPiP,
  parameters: { layout: "padded" },
  args: { label: "Your camera" },
  argTypes: {
    corner: { control: "inline-radio", options: ["top-left", "top-right", "bottom-left", "bottom-right"] },
    size: { control: "inline-radio", options: ["small", "large"] },
    children: { control: false },
    keepOut: { control: false },
  },
  render: (args) => (
    <Stage>
      <SnapPiP {...args}>
        <SelfView />
      </SnapPiP>
    </Stage>
  ),
} satisfies Meta<typeof SnapPiP>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. Drag it and throw it; focus it and press Option and an arrow key; double-click it. */
export const Playground: Story = {};

function InACall({ size }: { size?: "small" | "large" }) {
  const band = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLParagraphElement>(null);
  return (
    <Stage band={band} name={name}>
      <SnapPiP label="Your camera" defaultSize={size} keepOut={[band, name]}>
        <SelfView />
      </SnapPiP>
    </Stage>
  );
}

/** A call's stage with a band of controls along the bottom and a name tag at the top, which the corners keep clear of. */
export const InCall: Story = {
  parameters: { screenshot: { name: "snap-pip-in-call" } },
  render: () => <InACall />,
};

/** The large size, after a double-click or Option-Return: it grows from its corner and still clears the band. */
export const Large: Story = {
  render: () => <InACall size="large" />,
};

function Remembered() {
  const [corner, setCorner] = useState<SnapPiPCorner>("top-left");
  const name = useRef<HTMLParagraphElement>(null);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <Button size="sm" variant="outline" tone="secondary" onClick={() => setCorner("top-left")}>
          Top left
        </Button>
        <Button size="sm" variant="outline" tone="secondary" onClick={() => setCorner("bottom-right")}>
          Bottom right
        </Button>
        <span data-testid="saved-corner" style={{ fontSize: 14, color: "var(--muted-foreground)" }}>
          Saved corner: {corner}
        </span>
      </div>
      <Stage name={name}>
        <SnapPiP label="Your camera" corner={corner} onCornerChange={setCorner} keepOut={[name]}>
          <SelfView />
        </SnapPiP>
      </Stage>
    </div>
  );
}

/** A controlled corner an app remembers: `onCornerChange` reports each throw, and the buttons set it. The top-left corner sits below the name tag. */
export const ControlledCorner: Story = {
  render: () => <Remembered />,
};

/** With reduced motion, from `OuroProvider motion="reduced"`: it jumps to its corner, with no spring, no lift and no rubberband. */
export const ReducedMotion: Story = {
  render: () => (
    <OuroProvider motion="reduced">
      <InACall />
    </OuroProvider>
  ),
};
