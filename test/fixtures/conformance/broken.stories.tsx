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

const pairStyles = `
.broken-pair-outline, .broken-pair-shadow { border: 1px solid GrayText; outline: none; background: transparent; padding: 4px 8px; }
.broken-pair-outline:focus-visible { outline: 2px solid; outline-offset: 2px; }
.broken-pair-shadow:focus-visible { box-shadow: 0 0 0 3px royalblue; }
`;

/**
 * Forced colours: two buttons of one component, the first with an outline focus ring and the
 * second with a ring drawn only with a box shadow. Focus moving from the first to the second takes
 * the first's ring away, which is no cue on the second.
 */
export const SiblingShadowFocus: Story = {
  render: () => (
    <div data-ouro="broken-pair">
      <style>{pairStyles}</style>
      <button type="button" className="broken-pair-outline">Outline</button>
      <button type="button" className="broken-pair-shadow">Shadow</button>
    </div>
  ),
};

/**
 * Forced colours: two parts of one component, where the second refuses focus: its focus handler
 * sends focus to the first, another part. When the first already has focus, focus never moves;
 * from outside, it lands on a part that is not the second's kind. Neither is a redirect (as
 * OtpField's slot sends focus on to another slot), and the second never shows a cue.
 */
export const FocusRefused: Story = {
  render: () => (
    <div data-ouro="broken-refuse">
      <style>{pairStyles}</style>
      <button type="button" className="broken-pair-outline broken-refuse-first" data-ouro-control="broken-refuse" data-ouro-part="first">
        Takes focus
      </button>
      <button
        type="button"
        className="broken-pair-outline"
        data-ouro-control="broken-refuse"
        data-ouro-part="second"
        onFocus={(event) => event.currentTarget.parentElement?.querySelector<HTMLElement>(".broken-refuse-first")?.focus()}
      >
        Refuses focus
      </button>
    </div>
  ),
};

const loneStyles = `
.broken-lone { border: 1px solid; padding: 4px 8px; }
.broken-lone[data-highlighted] { background: royalblue; color: white; }
`;

/**
 * Forced colours: the only option of a list, highlighted from the start, with a border at rest
 * and a highlight drawn only with a fill, which forced colours drop.
 */
export const LoneFillHighlight: Story = {
  render: () => (
    <div role="listbox" aria-label="Lone">
      <style>{loneStyles}</style>
      <div role="option" aria-selected="false" className="broken-lone" data-highlighted="">
        Only option
      </div>
    </div>
  ),
};
