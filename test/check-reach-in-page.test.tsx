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

  it("finds a card below the fold on a page that scrolls smoothly, and puts the page's scroll back", () => {
    render(`<style>html { scroll-behavior: smooth; }</style><div style="height: 2400px"></div>${card('style="position: relative"')}`);
    try {
      expect(issues()).toHaveLength(1);
      expect(scrollY).toBe(0);
    } finally {
      host.remove();
    }
  });

  it("runs none of the page's code: a root's own click handler never runs, and only a root marked data-follows-link passes", () => {
    render(card('style="position: relative"'));
    let clicks = 0;
    host.querySelector("article")!.addEventListener("click", () => clicks++);
    expect(issues()).toHaveLength(1);
    expect(clicks).toBe(0);
    host.querySelector("article")!.setAttribute("data-follows-link", "");
    expect(issues()).toEqual([]);
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

describe("findDeadZones: which cards it judges, and how it names them", () => {
  it("names a card by its id, first classes and link text, cut at 40 letters", () => {
    const title = "Braising short ribs low and slow with a lid on";
    render(`${stretched}<article id="ribs" class="card a b c" ><div class="media"></div><div style="position: relative"><h3><a class="s" href="#x">${title}</a></h3></div></article>`);
    expect(issues()[0]![1]).toBe(`article#ribs.card.a.b "${title.slice(0, 40)}…"`);
    host.remove();
    render(`${stretched}<article style="position: relative"><div class="media"></div><div style="position: relative"><h3><a class="s" href="#x">Searing</a></h3></div></article>`);
    expect(issues()[0]![1]).toBe('article "Searing"');
  });

  it("skips a card allowed for every rule with a reason, and judges one whose allow gives no reason", () => {
    render(card('style="position: relative"', 'data-ouro-allow="all" data-ouro-allow-why="a gallery whose pictures open their own viewer"'));
    expect(issues()).toEqual([]);
    host.remove();
    render(card('style="position: relative"', 'data-ouro-allow="linked-card-dead-zone"'));
    expect(issues()).toHaveLength(1);
  });

  it("judges no root without a stretched link, no stretched link outside a card, and a card's second link not again", () => {
    render(
      `${stretched}<div data-linked=""><a href="#x">Plain</a></div>` +
        `<div class="card"><div class="media"></div><div style="position: relative"><a class="s" href="#x">Loose</a></div></div>` +
        `<article class="card"><div class="media"></div><div style="position: relative"><h3><a class="s" href="#x">First</a></h3><a class="s" href="#y">Second</a></div></article>`,
    );
    expect(issues().map(([, element]) => element)).toEqual(['article.card "First"']);
  });

  it("judges no box around a link the page positions: its ::after only widens the link's tap target (ourostack/ouroboros-website's .hit)", () => {
    // As the website's article on /lab/model-reviews/: a section with a link to its transcript, not a card that is one link.
    const hit = "<style>.hit { position: relative; } .hit::after { content: ''; position: absolute; left: 50%; top: 50%; width: max(100%, 2.75rem); height: max(100%, 2.75rem); transform: translate(-50%, -50%); }</style>";
    render(`${hit}<article><h2>Anthropic</h2><p>Verdict</p><a class="hit" href="#x">Read the 3-round transcript</a><blockquote>A quote long enough to fill the box.</blockquote></article>`);
    expect(issues()).toEqual([]);
    host.remove();
    // The same box with a stretched link the page leaves static is still judged.
    render(`${stretched}<article class="card"><div class="media"></div><div style="position: relative"><a class="s" href="#x">Static</a></div></article>`);
    expect(issues().map(([, element]) => element)).toEqual(['article.card "Static"']);
  });

  it("skips a card too small to click and a hidden one, and leaves out spots off the screen or under a fixed bar", () => {
    render(
      `${stretched}<article class="card" style="height: 12px; overflow: hidden"><div style="position: relative"><a class="s" href="#x">Tiny</a></div></article>` +
        `<div hidden>${card('style="position: relative"')}</div>`,
    );
    expect(issues()).toEqual([]);
    host.remove();
    // Wider than the screen, under a bar fixed over its top: the spots past the screen's edge and under the bar are not the card's.
    render(
      `${stretched}<div style="position: fixed; inset: 0 0 auto 0; height: 120px; z-index: 5; background: #fff"></div>` +
        `<article class="card" style="width: ${innerWidth * 2}px"><div class="media"></div><h3><a class="s" href="#x">Wide</a></h3></article>`,
    );
    expect(issues()).toEqual([]);
  });
});

describe("markReveals: which reveals reveal-reflow walks", () => {
  it("marks up to its limit, leaves out an Item's actions without revealActions, an allowed reveal and a hidden one, and names one with no heading", () => {
    render(
      `<div data-ouro="item"><span data-item-actions="">Edit</span></div>` +
        `<div data-ouro-allow="reveal-reflow" data-ouro-allow-why="the row grows on purpose"><div data-ouro-reveal=""><h3>Allowed</h3></div></div>` +
        `<div data-ouro-allow="reveal-reflow"><div data-ouro-reveal=""><h3>No reason</h3></div></div>` +
        `<div style="display: none"><div data-ouro-reveal=""><h3>Hidden</h3></div></div>` +
        `<div><div data-ouro-reveal=""><p>No heading</p></div></div>`,
    );
    expect(markReveals(5).map(({ element }) => element)).toEqual(['div "No reason"', 'div ""']);
    delete state.__ouroCheckRef;
    expect(markReveals(1).map(({ element }) => element)).toEqual(['div "No reason"']);
  });

  it("lays out nothing for a ref no element carries", () => {
    expect(revealLayout({ ref: "v-none" })).toEqual([]);
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
