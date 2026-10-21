import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

// Stories that break the conformance matrix on purpose, one defect each, so each check proves it
// can fail (test/conformance/*.test.tsx, "proves it can fail"). They are not Ouro components and
// are not in Storybook: only the conformance checks render them. Inline styles and a <style>
// element, since Tailwind does not scan this folder.

const meta = { title: "Conformance/Broken" } satisfies Meta;
export default meta;

type Story = StoryObj<typeof meta>;

function SelfRemoving() {
  const [gone, setGone] = useState(false);
  return gone ? <p>Removed.</p> : <button type="button" onClick={() => setGone(true)}>Remove me</button>;
}

/** Focus: a button that removes itself when pressed, and hands focus nowhere. */
export const SelfRemovingButton: Story = { render: () => <SelfRemoving /> };

function TwoRegions() {
  const [saved, setSaved] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setSaved(true)}>Save</button>
      <p role="status">{saved ? "Saved" : ""}</p>
      <p aria-live="polite">{saved ? "Saved" : ""}</p>
    </div>
  );
}

/** Announcements: one press announces the same text in two live regions. */
export const SameTextTwoRegions: Story = { render: () => <TwoRegions /> };

// One formatter per options, made in whatever locale the page had when it was first asked for,
// as a library that caches `Intl.NumberFormat` at module level does.
const formatters = new Map<string, Intl.NumberFormat>();
function format(value: number, options: Intl.NumberFormatOptions): string {
  const key = JSON.stringify(options);
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, options);
    formatters.set(key, formatter);
  }
  return formatter.format(value);
}

/** Hydration: a number formatted in the page's locale through a module-level formatter cache. */
export const CachedFormatter: Story = { render: () => <p>{format(1234.5, { maximumFractionDigits: 1 })}</p> };

/** Right to left: a part placed at `left: 100%` of a box at the inline start, past the viewport's right edge in a right-to-left page. */
export const LeftFull: Story = {
  render: () => (
    <div style={{ position: "relative", width: 160, height: 40 }}>
      <span style={{ position: "absolute", left: "100%", top: 0, width: 160, height: 16, background: "currentColor" }} />
    </div>
  ),
};

const styles = `
.broken-shadow-focus { border: 1px solid GrayText; outline: none; background: transparent; padding: 4px 8px; }
.broken-shadow-focus:focus-visible { box-shadow: 0 0 0 3px royalblue; }
.broken-fill-edge { border: 0; background: #334; color: white; padding: 4px 8px; }
.broken-fill-edge:focus-visible { outline: 2px solid; }
`;

/** Forced colours: a focus ring drawn only with a box shadow, which forced colours drop. */
export const ShadowFocusRing: Story = {
  render: () => (
    <div>
      <style>{styles}</style>
      <button type="button" className="broken-shadow-focus">Shadow focus</button>
    </div>
  ),
};

/** Forced colours: a button whose only edge is its fill, which forced colours drop. */
export const FillOnlyEdge: Story = {
  render: () => (
    <div>
      <style>{styles}</style>
      <button type="button" className="broken-fill-edge">Fill edge</button>
    </div>
  ),
};
