import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { findDeadZones, markReveals, movedSince, revealLayout } from "@/registry/ouro/check/reach-check";
import { AspectRatio } from "@/registry/ouro/components/ouro/aspect-ratio/aspect-ratio";
import { Card } from "@/registry/ouro/components/ouro/card/card";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Ouro check's reach rules in a real browser: linked-card-dead-zone over hand-written cards and Ouro's own, and the
// layouts reveal-reflow compares, under a real hover and keyboard focus. scripts/check/ runs the whole check.

const state = window as unknown as { __ouroCheckRef?: number };
let host: HTMLDivElement;
let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  delete state.__ouroCheckRef;
  await commands.parkPointer();
});

function render(html: string): HTMLDivElement {
  host = document.createElement("div");
  host.style.width = "320px";
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

async function renderReact(node: React.ReactNode): Promise<HTMLDivElement> {
  host = document.createElement("div");
  host.style.width = "320px";
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

// A hand-written stretched link: the card is positioned, the link's ::after covers its nearest positioned box.
const stretched = "<style>.card { position: relative; } .media { height: 160px; background: #ddd; } .s::after { content: ''; position: absolute; inset: 0; }</style>";
const card = (body: string, attributes = "") =>
  `${stretched}<article class="card" ${attributes}><div class="media"></div><div class="body" ${body}><h3><a class="s" href="#dead-zone-nav">Braising</a></h3><p>Low heat</p></div></article>`;
const issues = () => findDeadZones().map(({ rule, element, detail }) => [rule, element, detail]);

describe("findDeadZones: linked-card-dead-zone", () => {
  it("finds a card whose body the page positions, which keeps the link's layer off the picture, and never follows the link", () => {
    render(card('style="position: relative"'));
    const found = issues();
    expect(found).toHaveLength(1);
    expect(found[0]![0]).toBe("linked-card-dead-zone");
    expect(found[0]![1]).toBe('article.card "Braising"');
    expect(found[0]![2]).toMatch(/^a click on \d+ of \d+ spots on it opens nothing: its link's layer stops at a part the page positions$/);
    expect(location.hash).not.toBe("#dead-zone-nav");
  });

  it("passes a card whose link's layer covers it all, a spot a control of its own takes, and a card allowed with a reason", () => {
    render(card(""));
    expect(issues()).toEqual([]);
    host.remove();
    render(`${stretched}<article class="card"><div class="media"><button style="position:relative;z-index:2;width:100%;height:160px">Play</button></div><h3><a class="s" href="#x">Clip</a></h3></article>`);
    expect(issues()).toEqual([]);
    host.remove();
    render(card('style="position: relative"', 'data-ouro-allow="linked-card-dead-zone" data-ouro-allow-why="the picture opens its own viewer"'));
    expect(issues()).toEqual([]);
  });

  it("passes Ouro's Card with its body positioned over the media by the page, which opens its link from a click anywhere", async () => {
    await renderReact(
      <>
        <style>{'[data-ouro="card"] > div:last-child { position: absolute; inset: auto 0 0 0; }'}</style>
        <Card href="#dead-zone-nav" title="Braising" description="Low heat" media={<AspectRatio ratio={4 / 3}><div /></AspectRatio>} />
      </>,
    );
    const link = host.querySelector("[data-card-link]")!;
    const picture = host.querySelector('[data-ouro="card"] > div')!.getBoundingClientRect();
    // The page's layout does leave the top of the picture outside the link's layer.
    expect(document.elementFromPoint(picture.left + 8, picture.top + 8)?.closest("a")).not.toBe(link);
    expect(issues()).toEqual([]);
    expect(location.hash).not.toBe("#dead-zone-nav");
  });
});

describe("revealLayout and movedSince: reveal-reflow", () => {
  it("sees a reveal that makes room move the card, on hover and on keyboard focus", async () => {
    render(
      `<style>.grow .more { display: none; } .grow:is(:hover, :has(:focus-visible)) .more { display: block; }</style>` +
        `<div class="grow" data-ouro-reveal><h3><a href="#x">Braising</a></h3><p class="more">Low heat, a lid, and time</p></div><p>After it</p>`,
    );
    const [reveal] = markReveals(3);
    expect(reveal).toEqual({ ref: expect.any(String), element: 'div "Braising"' });
    const rest = revealLayout({ ref: reveal!.ref });
    await userEvent.hover(host.querySelector("h3")!);
    expect(movedSince(rest, revealLayout({ ref: reveal!.ref }))).toBeGreaterThan(0);
    await commands.parkPointer();
    expect(movedSince(rest, revealLayout({ ref: reveal!.ref }))).toBe(0);
    revealLayout({ ref: reveal!.ref, focus: true });
    expect(movedSince(rest, revealLayout({ ref: reveal!.ref }))).toBeGreaterThan(0);
    revealLayout({ ref: reveal!.ref, blur: true });
  });

  it("sees nothing move for Ouro's rising description, which opens over the media, on hover and focus", async () => {
    await renderReact(
      <>
        <Card href="#x" title="Braising" description="Low heat, a lid, and time" media={<AspectRatio ratio={4 / 3}><div /></AspectRatio>} revealDescription="rise" />
        <p>After it</p>
      </>,
    );
    const [reveal] = markReveals(3);
    const rest = revealLayout({ ref: reveal!.ref });
    const settled = () => new Promise((done) => setTimeout(done, 400));
    await userEvent.hover(host.querySelector("h3")!);
    await settled();
    expect(movedSince(rest, revealLayout({ ref: reveal!.ref }))).toBe(0);
    await commands.parkPointer();
    await settled();
    revealLayout({ ref: reveal!.ref, focus: true });
    await settled();
    expect(movedSince(rest, revealLayout({ ref: reveal!.ref }))).toBe(0);
    revealLayout({ ref: reveal!.ref, blur: true });
  });

  it("tells a page that changed shape from one that moved", () => {
    expect(movedSince([0, 0, 10, 10], [0, 0, 10, 10, 1, 1, 1, 1])).toBe(-1);
    expect(movedSince([0, 0, 10, 10, 5, 5, 1, 1], [0, 0, 10, 10, 5, 5.25, 1, 1])).toBe(0);
    expect(movedSince([0, 0, 10, 10, 5, 5, 1, 1], [0, 0, 10, 10, 5, 6, 1, 1])).toBe(1);
  });
});
