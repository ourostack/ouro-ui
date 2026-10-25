export { audit, axeExclude, describeFindings, gateRunOptions, measureTextContrast };
export type { GateFinding, Verdict };

import axe from "axe-core";
import { page } from "vitest/browser";
import { pressTab } from "./tab";

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it.

/**
 * What an axe scan leaves out while an Ouro UI Dialog, ConfirmDialog or Sheet is open:
 * Base UI's focus guards. In WebKit they take `role="button"` without a name on purpose,
 * so VoiceOver's virtual cursor stays trapped in the modal, and axe reports
 * `aria-command-name` on them. They are visually hidden.
 *
 * @example
 * // Playwright
 * new AxeBuilder({ page }).exclude(axeExclude)
 * // axe-core
 * axe.run({ include: [document.documentElement], exclude: axeExclude.map((selector) => [selector]) })
 */
const axeExclude: string[] = ["[data-base-ui-focus-guard]"];

/** One node {@link audit} fails: a violation, or a check axe could not decide that no measurement passed. */
interface GateFinding {
  /** The axe rule. */
  rule: string;
  /** axe's impact, or null when it gave none. */
  impact: string | null;
  /** axe's one-line help for the rule. */
  help: string;
  /** The node's selector. */
  target: string;
  /** Why it fails: axe's own summary, or what the measurement found. */
  summary: string;
  /** Whether axe could not decide it (`incomplete`) and no measurement passed it. */
  undecided: boolean;
}

/** A measurement's verdict on one node axe could not decide. */
type Verdict = { pass: true } | { pass: false; reason: string };

/**
 * axe's options for {@link audit}: every rule as axe ships it, with every node of the violations
 * and of the undecided checks (axe keeps one node of a result type `resultTypes` leaves out).
 */
const gateRunOptions: axe.RunOptions = { resultTypes: ["violations", "incomplete"] };

/** {@link audit}'s findings as readable lines: the rule, its impact and help, and each node with why it fails. */
function describeFindings(findings: GateFinding[]): string {
  const byRule = new Map<string, GateFinding[]>();
  for (const finding of findings) {
    const head = `${finding.undecided ? "undecided " : ""}${finding.rule} (${finding.impact}): ${finding.help}`;
    byRule.set(head, [...(byRule.get(head) ?? []), finding]);
  }
  return [...byRule].map(([head, nodes]) => `${head}\n${nodes.map((node) => `  ${node.target}: ${node.summary}`).join("\n")}`).join("\n");
}

/**
 * An accessibility scan that fails closed: runs axe over `context` with every rule, and returns
 * every violation whatever its impact, and every check axe could not decide unless a
 * measurement passes it. Text axe cannot judge passes only when its worst pixel meets WCAG 1.4.3
 * ({@link measureTextContrast}); a popup trigger's `aria-controls` only when every element it
 * names is on the page or the trigger is collapsed; focusable content hidden from assistive
 * technology under an open modal only when Tab never reaches it. Anything else axe could not
 * decide fails with axe's own message.
 *
 * @example
 * const findings = await audit({ include: [document.documentElement], exclude: axeExclude.map((selector) => [selector]) });
 * expect(describeFindings(findings)).toBe("");
 */
async function audit(context: axe.ElementContext): Promise<GateFinding[]> {
  const result = await axe.run(context, gateRunOptions);
  const findings: GateFinding[] = [];
  for (const rule of result.violations) {
    for (const node of rule.nodes) {
      findings.push({ rule: rule.id, impact: rule.impact ?? null, help: rule.help, target: node.target.join(" "), summary: node.failureSummary ?? "", undecided: false });
    }
  }
  // Tab walks move focus, which can show a tooltip, so they run after every other measurement.
  const undecided = result.incomplete.flatMap((rule) => rule.nodes.map((node) => ({ rule, node })));
  const walksLast = undecided.sort((a, b) => Number(walks(a.node)) - Number(walks(b.node)));
  for (const { rule, node } of walksLast) {
    const verdict = await decide(rule.id, node);
    if (verdict.pass) continue;
    findings.push({ rule: rule.id, impact: rule.impact ?? null, help: rule.help, target: node.target.join(" "), summary: verdict.reason, undecided: true });
  }
  return findings;
}

/** The checks a node did not pass: in axe's results, an undecided node lists only those. */
const checksOf = (node: axe.NodeResult) => [...node.any, ...node.all, ...node.none];

/** Whether settling a node takes a Tab walk. */
const walks = (node: axe.NodeResult) => checksOf(node).some((check) => check.id === "focusable-modal-open");

/** Settles one node axe could not decide by measuring it, where the gate knows how; anything else fails with axe's message. */
async function decide(rule: string, node: axe.NodeResult): Promise<Verdict> {
  const open = checksOf(node);
  const message = open.map((check) => check.message).join("; ");
  const element = elementOf(node.target);
  if (!element) return { pass: false, reason: `${message} (the node is gone, so it cannot be measured)` };
  if (rule === "color-contrast") {
    const data = node.any[0]?.data as { expectedContrastRatio?: string } | undefined;
    return measureTextContrast(element, requiredRatio(element, data?.expectedContrastRatio));
  }
  if (open.length > 0 && open.every((check) => check.id === "aria-valid-attr-value" && (check.data as { messageKey?: string } | null)?.messageKey === "controlsWithinPopup")) {
    return popupControlsExist(element) ? { pass: true } : { pass: false, reason: message };
  }
  if (open.length > 0 && open.every((check) => check.id === "focusable-modal-open")) {
    const hidden = open.flatMap((check) => check.relatedNodes ?? []).map((related) => elementOf(related.target));
    if (hidden.some((entry) => entry === null)) return { pass: false, reason: `${message} (a focusable element is gone, so the walk cannot check it)` };
    const reached = await tabReaches(hidden as HTMLElement[]);
    return reached ? { pass: false, reason: `Tab reaches ${describe(reached)}, which is hidden from assistive technology` } : { pass: true };
  }
  return { pass: false, reason: message };
}

/** The element an axe selector names, when it still finds exactly one in the page. */
function elementOf(target: axe.UnlabelledFrameSelector | string[]): HTMLElement | null {
  const selector = target.at(-1);
  if (typeof selector !== "string" || target.length !== 1) return null;
  const found = document.querySelectorAll<HTMLElement>(selector);
  return found.length === 1 ? found[0]! : null;
}

/** An element as a person would find it in a failure: its tag, its id or its text. */
const describe = (element: Element) => `<${element.localName}${element.id ? `#${element.id}` : ""}> "${(element.textContent ?? "").trim().slice(0, 40) || element.getAttribute("aria-label") || ""}"`;

/** Whether every element a popup trigger's `aria-controls` names is on the page, or the trigger is collapsed (its popup need not exist yet). */
function popupControlsExist(element: Element): boolean {
  if (element.getAttribute("aria-expanded") === "false") return true;
  const ids = (element.getAttribute("aria-controls") ?? "").split(/\s+/).filter(Boolean);
  return ids.length > 0 && ids.every((id) => element.ownerDocument.getElementById(id) !== null);
}

/**
 * Presses Tab around the page from where focus is, and returns the first of `targets` (or an
 * element inside one) it lands on, or null when it never does. Focus goes back where it was.
 */
async function tabReaches(targets: HTMLElement[]): Promise<HTMLElement | null> {
  const start = document.activeElement;
  const stops = document.querySelectorAll("a[href], button, input, select, textarea, [tabindex], [contenteditable]").length;
  let reached: HTMLElement | null = null;
  for (let press = 0; press < stops + 2 && !reached; press++) {
    await pressTab();
    const active = document.activeElement;
    reached = targets.find((target) => active !== null && target.contains(active)) ?? null;
  }
  if (start instanceof HTMLElement && start.isConnected) start.focus();
  return reached;
}

/**
 * The contrast WCAG 1.4.3 asks of the element's text: axe's own figure when it gave one, else 3:1
 * for large text (24px, or 18.66px bold) and 4.5:1 for the rest.
 */
function requiredRatio(element: Element, expected: string | undefined): number {
  const stated = expected ? Number.parseFloat(expected) : Number.NaN;
  if (Number.isFinite(stated)) return stated;
  const style = getComputedStyle(element);
  const size = Number.parseFloat(style.fontSize);
  const bold = Number.parseInt(style.fontWeight, 10) >= 700;
  return size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
}

/** A color as sRGB channels from 0 to 255 and alpha from 0 to 1. */
interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Any color the browser computes (`oklch(…)`, `color(srgb …)`, `rgb(…)`) as sRGB, by painting it on a canvas. */
function toRgba(color: string): Rgba {
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  context.canvas.width = 1;
  context.canvas.height = 1;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
  return { r: r!, g: g!, b: b!, a: a! / 255 };
}

const linear = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ({ r, g, b }: Rgba) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** WCAG's contrast ratio between two opaque colors. */
function contrast(a: Rgba, b: Rgba): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** `top` painted over an opaque `under`. */
const over = (top: Rgba, under: Rgba): Rgba => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
});

/** The boxes of the element's own text on the screen, one per line; for a text field, its content box. */
function textBoxes(element: Element): DOMRect[] {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const inset = (side: "Top" | "Right" | "Bottom" | "Left") => Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) + Number.parseFloat(style.getPropertyValue(`padding-${side.toLowerCase()}`));
    return [new DOMRect(box.left + inset("Left"), box.top + inset("Top"), box.width - inset("Left") - inset("Right"), box.height - inset("Top") - inset("Bottom"))];
  }
  const boxes: DOMRect[] = [];
  const range = document.createRange();
  for (const child of element.childNodes) {
    if (child.nodeType !== Node.TEXT_NODE || !child.textContent?.trim()) continue;
    range.selectNodeContents(child);
    boxes.push(...[...range.getClientRects()].filter((box) => box.width > 0 && box.height > 0));
  }
  return boxes;
}

/** The opacity the element's text is painted with: its own and every ancestor's, multiplied. */
function paintedOpacity(element: Element): number {
  let opacity = 1;
  for (let node: Element | null = element; node; node = node.parentElement) opacity *= Number.parseFloat(getComputedStyle(node).opacity);
  return opacity;
}

/** The rule that hides glyphs while the page behind them is screenshotted. */
const hideGlyphs =
  "[data-ouro-measure], [data-ouro-measure] * { color: transparent !important; -webkit-text-fill-color: transparent !important; " +
  "text-shadow: none !important; text-decoration-color: transparent !important; caret-color: transparent !important; transition: none !important; }";

/**
 * Measures text contrast that axe could not judge: hides the element's glyphs, screenshots the
 * page and finds the worst pixel behind each line of its text. Anything drawn over the text
 * (an outline, a tag, a veil) counts as behind it, since it is what the text is seen against.
 * Passes when the text color, as painted over that pixel, meets `required` (4.5 or 3). Where an open
 * popup has shut the text off from assistive technology and covers it, the covered part is inactive
 * and only what still shows is measured.
 *
 * @example
 * const verdict = await measureTextContrast(label, 4.5);
 * expect(verdict).toEqual({ pass: true });
 */
async function measureTextContrast(element: HTMLElement, required: number): Promise<Verdict> {
  element.scrollIntoView({ block: "nearest", inline: "nearest" });
  const boxes = textBoxes(element);
  if (boxes.length === 0) return { pass: false, reason: "axe could not judge its contrast, and it has no text of its own to measure" };
  const color = toRgba(getComputedStyle(element).color);
  const text = { ...color, a: color.a * paintedOpacity(element) };
  const style = document.createElement("style");
  style.textContent = hideGlyphs;
  element.setAttribute("data-ouro-measure", "");
  document.head.append(style);
  let shot: string;
  try {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    shot = await page.screenshot({ save: false });
  } finally {
    element.removeAttribute("data-ouro-measure");
    style.remove();
  }
  const image = new Image();
  image.src = `data:image/png;base64,${shot}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const origin = document.body.getBoundingClientRect();
  const scale = image.naturalWidth / origin.width;
  // Text an open popup shuts off from assistive technology is inactive where an exposed layer (the
  // popup) covers it: those pixels are the popup's, measured as its own text. What still shows is
  // measured. A layer hidden with the text (an overlay's outlines and tags) covers nothing.
  const shutOff = element.closest('[aria-hidden="true"], [inert]') !== null;
  const coveredAt = (x: number, y: number) => {
    const top = document.elementFromPoint(x, y);
    return top !== null && !element.contains(top) && !top.closest('[aria-hidden="true"], [inert]');
  };
  let worst = Number.POSITIVE_INFINITY;
  let measured = 0;
  let covered = 0;
  for (const box of boxes) {
    const left = Math.max(0, Math.floor((box.left - origin.left) * scale));
    const top = Math.max(0, Math.floor((box.top - origin.top) * scale));
    const right = Math.min(canvas.width, Math.ceil((box.right - origin.left) * scale));
    const bottom = Math.min(canvas.height, Math.ceil((box.bottom - origin.top) * scale));
    if (right <= left || bottom <= top) continue;
    const width = right - left;
    const pixels = context.getImageData(left, top, width, bottom - top).data;
    for (let index = 0; index < pixels.length; index += 4) {
      const pixel = index / 4;
      if (shutOff && coveredAt(origin.left + (left + (pixel % width) + 0.5) / scale, origin.top + (top + Math.floor(pixel / width) + 0.5) / scale)) {
        covered++;
        continue;
      }
      measured++;
      const behind = { r: pixels[index]!, g: pixels[index + 1]!, b: pixels[index + 2]!, a: 1 };
      worst = Math.min(worst, contrast(over(text, behind), behind));
    }
  }
  if (measured === 0 && covered > 0) return { pass: true };
  if (worst === Number.POSITIVE_INFINITY) return { pass: false, reason: "axe could not judge its contrast, and its text is off the screen" };
  if (worst >= required) return { pass: true };
  return { pass: false, reason: `measured ${worst.toFixed(2)}:1 against the worst pixel behind its text, needs ${required}:1` };
}
