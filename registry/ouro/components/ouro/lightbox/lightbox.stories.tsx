import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { Lightbox, type LightboxImage } from "@/registry/ouro/components/ouro/lightbox/lightbox";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names). The photos are
// drawn inline, so the stories need no network.

function photo(width: number, height: number, sky: string, sun: string, land: string, water: string): string {
  const horizon = Math.round(height * 0.62);
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${sun}" stop-opacity="0.55"/></linearGradient></defs>` +
      `<rect width="${width}" height="${height}" fill="url(#s)"/>` +
      `<circle cx="${Math.round(width * 0.68)}" cy="${Math.round(height * 0.3)}" r="${Math.round(Math.min(width, height) * 0.11)}" fill="${sun}"/>` +
      `<path d="M0 ${horizon} L${Math.round(width * 0.22)} ${Math.round(height * 0.36)} L${Math.round(width * 0.42)} ${horizon} L${Math.round(width * 0.6)} ${Math.round(height * 0.44)} L${width} ${horizon} V${height} H0 Z" fill="${land}"/>` +
      `<rect y="${horizon}" width="${width}" height="${height - horizon}" fill="${water}" opacity="0.8"/>` +
      `</svg>`,
  )}`;
}

const coast: LightboxImage[] = [
  {
    src: photo(1600, 1000, "#8ec5e8", "#ffd166", "#3d7a5a", "#2f6f8f"),
    alt: "A green headland under a morning sun, above a calm blue bay",
    title: "Morning",
    caption: "The bay from the north path, before the wind picks up.",
  },
  {
    src: photo(900, 1200, "#f4a261", "#ffe8a3", "#6b4f3a", "#4a6c8c"),
    alt: "Tall cliffs at noon over a harbour, in a portrait frame",
    title: "Noon",
    caption: "Shot upright from the harbour wall.",
  },
  {
    src: photo(1800, 800, "#e76f51", "#f4d35e", "#2a3d45", "#264653"),
    alt: "A long ridge against an orange evening sky, over dark water",
    title: "Evening",
  },
  {
    src: photo(1000, 1000, "#1d3557", "#f1faee", "#16262e", "#1b4965"),
    alt: "The coast at night under a full moon",
  },
];

function Surface({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        padding: 24,
        maxWidth: 640,
      }}
    >
      {children}
    </div>
  );
}

const meta = {
  title: "Display/Lightbox",
  component: Lightbox,
  parameters: { layout: "padded" },
  args: { label: "Coast photos", images: coast },
  argTypes: {
    images: { control: false },
    loop: { control: "boolean" },
  },
  render: (args) => (
    <Surface>
      <Lightbox {...args} />
    </Surface>
  ),
} satisfies Meta<typeof Lightbox>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. */
export const Playground: Story = {};

/** Thumbnails that open the viewer, with titles and captions under the images. */
export const Photos: Story = {
  parameters: { screenshot: { name: "lightbox-open", open: true } },
};

/** Next on the last image goes back to the first, and each image links to its original. */
export const LoopWithOriginals: Story = {
  args: {
    loop: true,
    images: coast.slice(0, 3).map((image, position) => ({ ...image, href: `https://example.com/photos/coast-${position + 1}.jpg` })),
  },
};

/** The viewer alone, opened from a before-and-after pair the app lays out itself, with an arrow between. */
function BeforeAndAfterPair() {
  const pair = coast.slice(0, 2).map((image, position) => ({ ...image, title: position === 0 ? "Before" : "After", href: `https://example.com/photos/coast-${position + 1}.jpg` }));
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  return (
    <Surface>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {pair.map((image, position) => (
          <div key={position} style={{ display: "contents" }}>
            {position === 1 && (
              <span aria-hidden="true" style={{ fontSize: 24, color: "var(--muted-foreground)" }}>
                →
              </span>
            )}
            <button
              data-test-harness=""
              type="button"
              aria-label={`See ${image.title.toLowerCase()}`}
              onClick={() => {
                setIndex(position);
                setOpen(true);
              }}
              style={{ padding: 0, border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", width: 160, height: 120, background: "var(--muted)" }}
            >
              <img src={image.src} alt={image.alt} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
            </button>
          </div>
        ))}
      </div>
      <Lightbox label="Coast, before and after" images={pair} open={open} index={index} onOpenChange={setOpen} onIndexChange={setIndex} />
    </Surface>
  );
}

/** Controlled: `open`, `index`, `onOpenChange` and `onIndexChange`, with thumbnails the app draws. */
export const BeforeAndAfter: Story = {
  parameters: { plainOpeners: ["See before", "See after"] },
  render: () => <BeforeAndAfterPair />,
};
