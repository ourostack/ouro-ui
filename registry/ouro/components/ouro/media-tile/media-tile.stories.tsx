import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties, type ReactNode } from "react";
import { MediaTile } from "@/registry/ouro/components/ouro/media-tile/media-tile";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names). The "video" in
// each tile is a CSS gradient, and the people are made up: no real photos.

/** A made-up camera picture: a soft room in a gradient, with a lighter shape where a person sits. */
function Camera({ hue }: { hue: number }) {
  return (
    <div
      style={{
        background:
          `radial-gradient(circle at 50% 42%, hsl(${hue} 30% 78%) 0 11%, transparent 11.5%), ` +
          `radial-gradient(ellipse 30% 32% at 50% 92%, hsl(${hue} 28% 70%) 0 99%, transparent 100%), ` +
          `linear-gradient(160deg, hsl(${hue} 45% 32%), hsl(${hue + 40} 40% 18%))`,
      }}
    />
  );
}

/** A made-up shared window, drawn as an SVG at 4:3, so a share at `contain` shows bars beside it. */
const sharedWindow =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#e8eefc"/><stop offset="1" stop-color="#c9d6f5"/></linearGradient></defs>' +
      '<rect width="400" height="300" fill="url(#g)"/><rect width="400" height="28" fill="#2f3b59"/>' +
      '<rect x="24" y="56" width="220" height="16" rx="4" fill="#2f3b59"/><rect x="24" y="88" width="352" height="10" rx="4" fill="#8a9bc4"/>' +
      '<rect x="24" y="108" width="300" height="10" rx="4" fill="#8a9bc4"/><rect x="24" y="148" width="160" height="110" rx="8" fill="#6b83c9"/>' +
      '<rect x="200" y="148" width="176" height="110" rx="8" fill="#9fb2e3"/></svg>',
  );

const frame = (width: number): CSSProperties => ({ width, maxWidth: "100%" });

function Stage({ children, width = 360 }: { children: ReactNode; width?: number }) {
  return <div style={frame(width)}>{children}</div>;
}

const meta = {
  title: "Display/MediaTile",
  component: MediaTile,
  parameters: { layout: "padded" },
  args: { name: "Mara Lind", speaking: true },
  argTypes: {
    connection: { control: "inline-radio", options: ["good", "fair", "poor"] },
    source: { control: "inline-radio", options: ["camera", "screen"] },
    fit: { control: "inline-radio", options: ["cover", "contain"] },
  },
  render: (args) => (
    <Stage>
      <MediaTile {...args}>
        <Camera hue={200} />
      </MediaTile>
    </Stage>
  ),
} satisfies Meta<typeof MediaTile>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** The camera on, and the person speaking: the ring is on, and the tile reads "Mara Lind, speaking, camera on". */
export const CameraOnSpeaking: Story = {
  args: { name: "Mara Lind", speaking: true },
};

/** The camera off: the person's initials, sized to the tile, with the name plate below. */
export const CameraOff: Story = {
  args: { name: "Jonas Ek", speaking: false, cameraOn: false, avatar: { idForColor: "jonas" } },
};

/** Muted, with a hand up: the crossed-out microphone on the plate, and the hand in the top corner. */
export const MutedHandRaised: Story = {
  args: { name: "Priya Raman", speaking: false, muted: true, handRaised: true },
};

/** A poor connection: a glyph in the top corner, read as "poor connection". */
export const PoorConnection: Story = {
  args: { name: "Theo Okafor", speaking: false, connection: "poor" },
};

/** A paused picture: the app stopped receiving it, so the photo shows with a pause glyph and the reason in its tooltip. */
export const Paused: Story = {
  args: { name: "Mara Lind", speaking: false, paused: "video paused to save power" },
};

/** A shared screen at `contain`: the whole window, never cropped, with bars beside it, and "Presenting" on the plate. */
export const ShareContain: Story = {
  args: { name: "Theo Okafor", speaking: false, source: "screen", presenting: true, ring: false },
  render: (args) => (
    <Stage width={480}>
      <MediaTile {...args}>
        <img src={sharedWindow} alt="" />
      </MediaTile>
    </Stage>
  ),
};

function Grid() {
  const [pinned, setPinned] = useState("");
  const pin = (name: string) => (next: boolean) => setPinned(next ? name : "");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, width: 640, maxWidth: "100%" }}>
      <MediaTile name="Mara Lind" speaking pinned={pinned === "Mara Lind"} onPinnedChange={pin("Mara Lind")}>
        <Camera hue={200} />
      </MediaTile>
      <MediaTile name="Jonas Ek" muted cameraOn={false} avatar={{ idForColor: "jonas" }} pinned={pinned === "Jonas Ek"} onPinnedChange={pin("Jonas Ek")} />
      <MediaTile name="Priya Raman" handRaised pinned={pinned === "Priya Raman"} onPinnedChange={pin("Priya Raman")}>
        <Camera hue={30} />
      </MediaTile>
      <MediaTile name="Theo Okafor" connection="poor" muted pinned={pinned === "Theo Okafor"} onPinnedChange={pin("Theo Okafor")}>
        <Camera hue={280} />
      </MediaTile>
    </div>
  );
}

/** A grid of four equals: Mara speaking, Jonas muted with his camera off, Priya with her hand up, Theo on a poor connection. Point at a tile, or tab to it, for its Pin. */
export const GridOfFour: Story = {
  parameters: { screenshot: { name: "media-tile-grid" } },
  render: () => <Grid />,
};

function Speaker() {
  const [speaking, setSpeaking] = useState(false);
  return (
    <OuroProvider motion="reduced">
      <div style={{ display: "grid", gap: 16, width: 360, maxWidth: "100%" }}>
        <Switch label="Mara is speaking" checked={speaking} onCheckedChange={setSpeaking} />
        <MediaTile name="Mara Lind" speaking={speaking}>
          <Camera hue={200} />
        </MediaTile>
      </div>
    </OuroProvider>
  );
}

/** With reduced motion: the ring is steady, on or off, with no fade. Turn the switch to make Mara speak. */
export const ReducedMotion: Story = {
  render: () => <Speaker />,
};
