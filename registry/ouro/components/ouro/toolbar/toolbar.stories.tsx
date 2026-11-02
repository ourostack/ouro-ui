import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode, type SVGProps } from "react";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
import { Toolbar, type ToolbarEntry } from "@/registry/ouro/components/ouro/toolbar/toolbar";

// Layout here uses inline styles and the theme's CSS variables (shadcn's names).

function icon(path: ReactNode) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
        {path}
      </svg>
    );
  };
}
const BoldIcon = icon(<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />);
const ItalicIcon = icon(<path d="M14 5h-4M14 19h-4M14 5l-4 14" />);
const UnderlineIcon = icon(<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" />);
const StrikeIcon = icon(<path d="M5 12h14M16 6.5A4 3 0 0 0 12 5c-2.5 0-4 1.3-4 3s1.5 2.5 4 3M8 17.5A4 3 0 0 0 12 19c2.5 0 4-1.3 4-3" />);
const LinkIcon = icon(<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />);
const BulletsIcon = icon(<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />);
const NumbersIcon = icon(<path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M4 14h3l-3 4h3" />);
const CodeIcon = icon(<path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />);
const QuoteIcon = icon(<path d="M6 17c-1.5 0-2-1.2-2-3 0-3 2-6 5-7M15 17c-1.5 0-2-1.2-2-3 0-3 2-6 5-7" />);
const UndoIcon = icon(<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />);
const RedoIcon = icon(<path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />);

/** A themed panel. It follows the page's scheme (the `.dark` class on the root). */
function Surface({ children, width }: { children: ReactNode; width?: number }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) + 4px)",
        padding: 16,
        display: "grid",
        gap: 12,
        width,
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

/** The formatting a message composer offers, with Bold and Italic kept by the toolbar. */
const formatting: ToolbarEntry[] = [
  { type: "toggle", label: "Bold", icon: BoldIcon, hideLabel: true, shortcut: ["mod", "b"] },
  { type: "toggle", label: "Italic", icon: ItalicIcon, hideLabel: true, shortcut: ["mod", "i"] },
  { type: "toggle", label: "Underline", icon: UnderlineIcon, hideLabel: true, shortcut: ["mod", "u"] },
  { type: "toggle", label: "Strikethrough", icon: StrikeIcon, hideLabel: true, shortcut: ["mod", "shift", "x"] },
  { type: "separator" },
  { label: "Insert link", icon: LinkIcon, hideLabel: true, shortcut: ["mod", "k"] },
  { type: "separator" },
  {
    type: "group",
    label: "Lists",
    items: [
      { label: "Bulleted list", icon: BulletsIcon, hideLabel: true },
      { label: "Numbered list", icon: NumbersIcon, hideLabel: true },
    ],
  },
  { type: "separator" },
  { type: "toggle", label: "Code", icon: CodeIcon, hideLabel: true, shortcut: ["mod", "e"] },
  { label: "Quote", icon: QuoteIcon, hideLabel: true },
];

const meta = {
  title: "Actions/Toolbar",
  component: Toolbar,
  parameters: { layout: "padded" },
  args: { label: "Formatting", items: formatting, size: "sm" },
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    keepFocus: { control: "boolean" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Toolbar>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Try every prop. Tab reaches the toolbar once; the arrow keys, Home and End move inside it. */
export const Playground: Story = {
  render: (args) => (
    <Surface>
      <Toolbar {...args} />
    </Surface>
  ),
};

/** Too narrow for every control: the ones that do not fit move into the More menu, toggles as checkbox items. */
export const Overflow: Story = {
  render: () => (
    <Surface width={260}>
      <Toolbar label="Formatting" size="sm" items={formatting} />
    </Surface>
  ),
};

/** Commands with visible labels, beside icon-only ones; a disabled command stays reachable with the arrow keys. */
export const Labeled: Story = {
  render: () => (
    <Surface>
      <Toolbar
        label="Document"
        size="sm"
        items={[
          {
            type: "group",
            label: "History",
            items: [
              { label: "Undo", icon: UndoIcon, hideLabel: true, shortcut: ["mod", "z"] },
              { label: "Redo", icon: RedoIcon, hideLabel: true, shortcut: ["mod", "shift", "z"], disabled: true },
            ],
          },
          { type: "separator" },
          { label: "Insert link", icon: LinkIcon },
          { type: "toggle", label: "Show outline", defaultPressed: true },
        ]}
      />
    </Surface>
  ),
};

/** Above a message box: `keepFocus` leaves the caret in the text when a control is clicked, and the app applies the state. */
export const Composer: Story = {
  render: function Render() {
    const [bold, setBold] = useState(false);
    const [italic, setItalic] = useState(false);
    const [sent, setSent] = useState<string[]>([]);
    return (
      <Surface width={560}>
        <Toolbar
          label="Formatting"
          size="sm"
          keepFocus
          items={[
            { type: "toggle", label: "Bold", icon: BoldIcon, hideLabel: true, shortcut: ["mod", "b"], pressed: bold, onPressedChange: setBold },
            { type: "toggle", label: "Italic", icon: ItalicIcon, hideLabel: true, shortcut: ["mod", "i"], pressed: italic, onPressedChange: setItalic },
            { type: "separator" },
            { label: "Insert link", icon: LinkIcon, hideLabel: true, shortcut: ["mod", "k"], onClick: () => setSent((list) => [...list, "link"]) },
          ]}
        />
        <TextArea label="Message" hideLabel placeholder="Type a message" autoGrow rows={2} maxRows={6} />
        <output style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
          {`Bold ${bold ? "on" : "off"}, italic ${italic ? "on" : "off"}${sent.length > 0 ? `, ${sent.length} link${sent.length > 1 ? "s" : ""} asked for` : ""}`}
        </output>
      </Surface>
    );
  },
};

/** Every control disabled at once. */
export const Disabled: Story = {
  render: () => (
    <Surface>
      <Toolbar label="Formatting" size="sm" disabled items={formatting.slice(0, 6)} />
    </Surface>
  ),
};

const MicIcon = icon(<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />);
const CameraIcon = icon(<path d="M3 7h12v10H3zM15 10l6-3v10l-6-3" />);
const ShareIcon = icon(<path d="M3 5h18v12H3zM12 14V8M9 11l3-3 3 3M8 21h8" />);
const CaptionsIcon = icon(<path d="M3 5h18v14H3zM10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3" />);

/** A call's controls, as a calling app lays them out: the person's own Mic and Camera, then Share and Captions, then Leave after a divider. */
const callControls: ToolbarEntry[] = [
  { type: "toggle", label: "Mute", icon: MicIcon, hideLabel: true, shortcut: ["mod", "shift", "m"] },
  { type: "toggle", label: "Camera off", icon: CameraIcon, hideLabel: true, shortcut: ["mod", "shift", "o"] },
  { label: "Share", icon: ShareIcon, hideLabel: true, shortcut: ["mod", "shift", "e"] },
  { type: "toggle", label: "Captions", icon: CaptionsIcon, hideLabel: true },
  { type: "separator" },
  { label: "Leave" },
];

/** A person's tile in the made-up meeting: a shape for their picture and their name on a plate. */
function Person({ name, hue }: { name: string; hue: string }) {
  return (
    <div style={{ position: "relative", display: "grid", placeItems: "center", background: `color-mix(in oklab, ${hue} 35%, var(--muted))`, borderRadius: 12, overflow: "hidden" }}>
      <div aria-hidden="true" style={{ width: "34%", aspectRatio: "1", borderRadius: "50%", background: `color-mix(in oklab, ${hue} 60%, var(--background))` }} />
      <span style={{ position: "absolute", insetInlineStart: 8, top: 8, padding: "2px 8px", borderRadius: 6, background: "var(--background)", color: "var(--foreground)", fontSize: 12 }}>{name}</span>
    </div>
  );
}

/**
 * A made-up meeting's stage, a picture-filled backdrop like a call's video, with the bar laid over
 * the pictures at its bottom by the app's own wrapper.
 */
function Stage({ children }: { children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label="Design review"
      style={{
        position: "relative",
        width: 720,
        maxWidth: "100%",
        aspectRatio: "16 / 10",
        boxSizing: "border-box",
        padding: 12,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        borderRadius: "calc(var(--radius) + 4px)",
        overflow: "hidden",
        background: "linear-gradient(135deg, color-mix(in oklab, var(--primary) 30%, var(--muted)), var(--muted))",
      }}
    >
      <Person name="Mara Lind" hue="var(--primary)" />
      <Person name="Jonas Ek" hue="var(--chart-2, var(--secondary))" />
      <Person name="Priya Raman" hue="var(--chart-3, var(--accent))" />
      <Person name="Theo Okafor" hue="var(--chart-4, var(--muted-foreground))" />
      {/* The wrapper passes presses through to the pictures beside the bar; a floating bar takes its own. */}
      <div style={{ position: "absolute", insetInline: 0, bottom: 16, display: "flex", justifyContent: "center", paddingInline: 16, pointerEvents: "none" }}>{children}</div>
    </div>
  );
}

/** Floating over a video-like backdrop: `floating` draws the bar as glass over the call's pictures, solid when the system asks for less transparency or more contrast. The wrapper that places it is the app's. */
export const Floating: Story = {
  name: "Floating over a video-like backdrop",
  render: () => (
    <Stage>
      <Toolbar label="Call controls" floating size="lg" items={callControls} />
    </Stage>
  ),
};

/** `autoHide={3000}`: the bar fades 3 seconds after the pointer rests, and comes back on a pointer move over the stage or when focus enters it (Tab). It stays while the pointer is over it, a control's tooltip is open, or keyboard focus is in it until the pointer moves. Faded, it is still in the accessibility tree. */
export const AutoHide: Story = {
  render: function Render() {
    const [hidden, setHidden] = useState(false);
    return (
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "minmax(0, 720px)" }}>
        <Stage>
          <Toolbar label="Call controls" floating autoHide={3000} onHiddenChange={setHidden} size="lg" items={callControls} />
        </Stage>
        <output style={{ fontSize: 13, color: "var(--muted-foreground)" }}>{hidden ? "Controls faded" : "Controls showing"}</output>
      </div>
    );
  },
};
