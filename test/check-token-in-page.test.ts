import { afterEach, describe, expect, it } from "vitest";
import { findOffThemeIssues } from "@/registry/ouro/check/token-check";

// Ouro check's off-theme and off-scale rules in a real browser, on this page's own theme (the Ouro theme app.css
// installs): the styles that bypass a token, the near misses that pass, and the opt-outs. scripts/check/check.test.mts
// runs the whole check on their fixture pages.

const state = window as unknown as { __ouroCheckRef?: number };
let host: HTMLDivElement;
const root = document.documentElement;

afterEach(() => {
  host?.remove();
  delete state.__ouroCheckRef;
  root.removeAttribute("style");
});

function render(html: string): HTMLDivElement {
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

/** This test's findings: those on an element it rendered, as [rule, element, detail]. */
const mine = (options?: Parameters<typeof findOffThemeIssues>[0]) =>
  findOffThemeIssues(options)
    .filter((issue) => host.querySelector(`[data-ouro-check-ref~="${issue.ref}"]`))
    .map(({ rule, element, detail }) => [rule, element, detail]);

/** Takes tokens off the page, as a page without them would have none. */
const without = (...names: string[]) => {
  for (const name of names) root.style.setProperty(name, "initial");
};
const everyToken = [
  ...["background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground", "destructive", "destructive-foreground", "success", "success-foreground", "warning", "warning-foreground", "border", "input", "ring"].map((n) => `--${n}`),
  "--radius", ...["sm", "md", "lg", "xl", "2xl"].map((s) => `--radius-${s}`),
  ...["xs", "sm", "md", "lg", "xl", "2xl"].map((s) => `--shadow-${s}`),
  ...["sans", "serif", "mono", "heading"].map((n) => `--font-${n}`),
  "--spacing",
];

describe("findOffThemeIssues: off-theme", () => {
  it("finds an app's fixed colour, radius, shadow and font, each named by its rule and the token to use", () => {
    render(`<style>
      .t-card { background-color: #ffffff; color: rgb(29 29 31); border: 1px solid oklch(0.9 0.02 300); border-radius: 13px; box-shadow: 0 4px 12px rgb(0 0 0 / 0.1); font-family: Georgia, serif; outline-color: red; }
      .t-wash { background-image: linear-gradient(#f6f1ff, var(--background)); }
      .t-chip { color: var(--color-rose-500); fill: tomato; }
    </style>
    <div class="t-card" id="card">Card words</div><div class="t-wash">Wash</div><p class="t-chip">Chip</p>`);
    expect(mine()).toEqual([
      ["off-theme", 'div#card.t-card "Card words"', ".t-card sets background: rgb(255, 255, 255), a fixed colour; use var(--card) (bg-card)"],
      ["off-theme", 'div#card.t-card "Card words"', ".t-card sets color: rgb(29, 29, 31), a fixed colour; use var(--foreground) (text-foreground)"],
      ["off-theme", 'div#card.t-card "Card words"', expect.stringMatching(/^\.t-card sets border-color: oklch\(0\.9 0\.02 300\), a fixed colour; use var\(--(border|input)\) \(border-(border|input)\)$/)],
      ["off-theme", 'div#card.t-card "Card words"', expect.stringMatching(/^\.t-card sets border-radius: 13px, a fixed radius; use (var|calc)\(--radius.*\) \(rounded-\w+\)$/)],
      ["off-theme", 'div#card.t-card "Card words"', expect.stringMatching(/^\.t-card sets box-shadow: rgba\(0, 0, 0, 0\.1\) 0px 4px 12px, a fixed shadow; use one of the theme's shadows, such as var\(--shadow-\w+\) \(shadow-\(--shadow-\w+\)\)$/)],
      ["off-theme", 'div#card.t-card "Card words"', ".t-card sets font-family: Georgia, serif, a fixed font; use var(--font-sans)"],
      ["off-theme", 'div#card.t-card "Card words"', expect.stringMatching(/^\.t-card sets outline-color: red, a fixed colour; use var\(--\w[\w-]*\) \(outline-[\w-]+\)$/)],
      ["off-theme", 'div.t-wash "Wash"', expect.stringMatching(/^\.t-wash sets background: linear-gradient\(.*\), a fixed colour; use var\(--[\w-]+\) \(bg-[\w-]+\)$/)],
      ["off-theme", 'p.t-chip "Chip"', expect.stringMatching(/^\.t-chip sets color: var\(--color-rose-500\), a fixed colour; use var\(--[\w-]+\) \(text-[\w-]+\)$/)],
      ["off-theme", 'p.t-chip "Chip"', expect.stringMatching(/^\.t-chip sets fill: tomato, a fixed colour; use var\(--[\w-]+\)$/)],
    ]);
    expect(host.querySelector("#card")!.getAttribute("data-ouro-check-ref")).toMatch(/^o\d+( o\d+)*$/);
  });

  it("names a heading's font, code's and the first the theme has, and the radius steps from --radius when the theme maps them inline", () => {
    render(`<style>.t-h { font-family: Georgia; } .t-c { font-family: Menlo; } .t-r { border-radius: 4px 4px 0 0; }</style>
      <h2 class="t-h">Heading</h2><code class="t-c">code</code><div class="t-r" title="A corner" style="height:8px"></div>`);
    root.style.setProperty("--font-heading", "Georgia");
    root.style.setProperty("--font-mono", "Menlo");
    for (const step of ["sm", "md", "lg", "xl", "2xl"]) root.style.setProperty(`--radius-${step}`, "initial");
    root.style.setProperty("--radius", "10px");
    expect(mine().map(([, element, detail]) => [element, detail])).toEqual([
      ['h2.t-h "Heading"', ".t-h sets font-family: Georgia, a fixed font; use var(--font-heading)"],
      ['code.t-c "code"', ".t-c sets font-family: Menlo, a fixed font; use var(--font-mono)"],
      ['div.t-r "A corner"', ".t-r sets border-radius: 4px 4px 0px 0px, a fixed radius; use calc(var(--radius) * 0.6) (rounded-sm)"],
    ]);
    without("--font-sans", "--font-heading", "--font-mono");
    root.style.setProperty("--font-serif", "Georgia");
    root.style.setProperty("--radius-lg", "10px");
    root.style.setProperty("--shadow-md", "initial");
    for (const step of ["sm", "md", "xl", "2xl"]) root.style.setProperty(`--radius-${step}`, "initial");
    root.style.setProperty("--radius", "initial");
    expect(mine().map(([, , detail]) => detail)).toEqual([".t-h sets font-family: Georgia, a fixed font; use var(--font-serif)", ".t-c sets font-family: Menlo, a fixed font; use var(--font-serif)", ".t-r sets border-radius: 4px 4px 0px 0px, a fixed radius; use var(--radius-lg) (rounded-lg)"]);
  });

  it("passes the theme's own tokens, keywords, see-through, system colours, a pill or circle, and a gradient of tokens", () => {
    render(`<style>
      .p-a { color: var(--foreground); background: var(--card); border-radius: var(--radius-md, 8px); box-shadow: var(--shadow-md, none); font-family: var(--font-sans); }
      .p-b { color: inherit; background-color: transparent; border-color: currentColor; box-shadow: none; font-family: inherit; }
      .p-c { color: rgb(0 0 0 / 0); background-image: linear-gradient(var(--background), transparent); }
      .p-d { border-radius: 9999px; outline-color: Highlight; }
      .p-e { border-radius: 50%; background-image: url("data:image/gif;base64,R0lGODlhAQABAAAAACw="); }
      .p-f { --t-own-color: #f0f; --t-own-radius: 7px; }
    </style>
    <div class="p-a">A</div><div class="p-b">B</div><div class="p-c">C</div><div class="p-d">D</div><div class="p-e">E</div><div class="p-f">F</div>`);
    expect(mine()).toEqual([]);
  });

  it("leaves an Ouro component's own utilities, Tailwind's theme and base layers and a drawing's colours alone, and judges an app's utility outside a component", () => {
    render(`<style>
      @layer utilities { .t-u { color: #123456; } }
      @layer theme { .t-theme { color: #123456; } }
      @layer base { .t-base { color: #123456; } }
      @layer components { .t-comp { color: #123456; } }
      @layer { .t-anon { color: #123456; } }
      .t-art { fill: #ff8800; stroke: #333; }
    </style>
    <div data-ouro="card"><span class="t-u">Inside</span></div>
    <span class="t-theme">Theme</span><span class="t-base">Base</span><span class="t-comp">Components</span><span class="t-anon">Anonymous</span>
    <svg width="10" height="10"><rect class="t-art" width="10" height="10" /></svg>`);
    expect(mine().map(([rule, element]) => [rule, element])).toEqual([
      ["off-theme", 'span.t-comp "Components"'],
      ["off-theme", 'span.t-anon "Anonymous"'],
    ]);
    host.insertAdjacentHTML("beforeend", '<span class="t-u">Outside</span>');
    expect(mine().map(([, element]) => element)).toContain('span.t-u "Outside"');
  });
});

describe("findOffThemeIssues: off-scale", () => {
  it("finds a fixed padding, margin or gap off the spacing step, once for its longhands, with the step", () => {
    render(`<style>
      .s-a { padding: 24px; }
      .s-b { margin: 1.5rem 0; }
      .s-c { display: flex; gap: 14px 10px; }
      .s-d { padding-top: 20px; }
    </style><div class="s-a">A</div><div class="s-b">B</div><div class="s-c">C</div><div class="s-d">D</div>`);
    expect(mine()).toEqual([
      ["off-scale", 'div.s-a "A"', ".s-a sets padding: 24px, a fixed spacing; use calc(var(--spacing) * 6) (p-6)"],
      ["off-scale", 'div.s-b "B"', ".s-b sets margin: 1.5rem 0px, a fixed spacing; use calc(var(--spacing) * 6) (m-6)"],
      ["off-scale", 'div.s-c "C"', ".s-c sets gap: 14px 10px, a fixed spacing; use calc(var(--spacing) * 4) (gap-4)"],
      ["off-scale", 'div.s-d "D"', ".s-d sets padding: 20px, a fixed spacing; use calc(var(--spacing) * 5) (p-5)"],
    ]);
  });

  it("passes the step, em, fluid spacing, a hairline, zero and auto", () => {
    render(`<style>
      .q-a { padding: calc(var(--spacing) * 4); margin: auto; }
      .q-b { padding: 0 0.3em; gap: clamp(1rem, 3vw, 2rem); }
      .q-c { margin-top: 1px; padding-inline: 10vw; row-gap: min(2rem, 4vh); }
    </style><div class="q-a">A</div><div class="q-b">B</div><div class="q-c">C</div>`);
    expect(mine()).toEqual([]);
  });
});

describe("findOffThemeIssues: the page and the opt-outs", () => {
  it("judges nothing on a page with no theme", () => {
    render(`<style>.n { color: #123456; border-radius: 9px; padding: 24px; box-shadow: 0 1px 2px #000; font-family: Georgia; }</style><div class="n">No theme</div>`);
    without(...everyToken);
    expect(mine()).toEqual([]);
  });

  it("judges only the kinds whose token the page defines", () => {
    render(`<style>.k { color: #123456; border-radius: 9px; padding: 24px; box-shadow: 0 1px 2px #000; font-family: Georgia; }</style><div class="k">Kinds</div>`);
    without(...everyToken.filter((name) => name !== "--spacing"));
    expect(mine().map(([rule]) => rule)).toEqual(["off-scale"]);
    // With only a card colour and no spacing step, a border takes the one colour there is, and spacing isn't judged.
    root.removeAttribute("style");
    without(...everyToken.filter((name) => name !== "--card"));
    expect(mine().map(([, , detail]) => detail)).toEqual([".k sets color: rgb(18, 52, 86), a fixed colour; use var(--card) (text-card)"]);
    host.insertAdjacentHTML("beforeend", `<style>.k2 { border-color: #123456; border-style: solid; }</style><div class="k2">Line</div>`);
    expect(mine().map(([, , detail]) => detail)).toEqual([".k sets color: rgb(18, 52, 86), a fixed colour; use var(--card) (text-card)", ".k2 sets border-color: rgb(18, 52, 86), a fixed colour; use var(--card) (border-card)"]);
  });

  it("names the theme's first shadow when it has no md step", () => {
    render(`<style>.sh { box-shadow: 0 1px 2px #000; }</style><div class="sh">Raised</div>`);
    without("--shadow-xs", "--shadow-md");
    root.style.setProperty("--shadow-lg", "0 8px 24px rgb(0 0 0 / 0.1)");
    expect(mine().map(([, , detail]) => detail)).toEqual([expect.stringMatching(/use one of the theme's shadows, such as var\(--shadow-(sm|lg)\) \(shadow-\(--shadow-(sm|lg)\)\)$/)]);
  });

  it("leaves an element opted out with a reason, and finds one opted out without", () => {
    render(`<style>.o { color: #123456; padding: 24px; }</style>
      <div data-ouro-allow="off-theme" data-ouro-allow-why="Brand colour from the print style guide"><span class="o">Allowed colour</span></div>
      <div data-ouro-allow="all" data-ouro-allow-why="A frozen mock-up"><span class="o">Allowed all</span></div>
      <span class="o" data-ouro-allow="off-theme">No reason</span>`);
    expect(mine().map(([rule, element]) => [rule, element])).toEqual([
      ["off-theme", 'span.o "No reason"'],
      ["off-scale", 'span.o "Allowed colour"'],
    ]);
  });

  it("matches a rule by its selector without states or pseudo-elements, reads nested and conditional rules, and skips what it can't read", () => {
    render(`<style>
      .m-a:hover { color: #123456; }
      .m-b::before { content: ""; color: #123456; }
      :hover { --t-x: 1; }
      :focus-within { color: #123456; }
      .m-c { & .m-d { color: #123456; } }
      @media (min-width: 1px) { .m-e { color: #123456; } }
      @supports (display: grid) { .m-f { color: #123456; } }
      @keyframes t-spin { to { color: #123456; } }
      @font-face { font-family: "T"; src: local("Arial"); }
      .m-g::part(thumb) { color: #123456; }
      .m-none { color: #123456; }
    </style><span class="m-a">Hover</span><span class="m-b">Before</span><div class="m-c"><span class="m-d">Nested</span></div><span class="m-e">Media</span><span class="m-f">Supports</span>`);
    const sheet = host.querySelector("style")!.sheet!;
    const other = document.createElement("style");
    other.textContent = ".m-x { color: #123456; }";
    document.head.append(other);
    // As a stylesheet from another origin reads, which throws.
    Object.defineProperty(other.sheet!, "cssRules", { get: () => { throw new DOMException("cross-origin", "SecurityError"); } });
    try {
      expect(sheet.cssRules.length).toBeGreaterThan(0);
      expect(mine().map(([, element]) => element)).toEqual(['span.m-a "Hover"', 'span.m-b "Before"', 'span.m-d "Nested"', 'span.m-e "Media"', 'span.m-f "Supports"']);
    } finally {
      other.remove();
    }
  });

  it("stops at maxIssues, names an element by its label, id and first classes, and shortens long words", () => {
    render(`<style>.x { color: #123456; } .y { color: #654321; } #t-bare { color: #345678; }</style>
      <button class="x one two three" aria-label="A label">Ignored</button>
      <p id="long" class="y">${"Words ".repeat(12)}</p>
      <div id="t-bare" style="height:4px"></div>`);
    expect(mine({ maxIssues: 1 }).map(([, element]) => element)).toEqual(['button.x.one.two "A label"']);
    expect(mine().map(([, element]) => element)).toEqual(['button.x.one.two "A label"', `p#long.y "${"Words ".repeat(12).trim().slice(0, 40)}…"`, "div#t-bare"]);
  });
});

describe("findOffThemeIssues: what an app writes past the theme in other ways", () => {
  it("judges a value through the app's own variable by what it holds, in the theme's namespaces too, but not an alias of a token, a keyword or Ouro's avatar tokens", () => {
    render(`<style>
      .v { --t-brand: #6d28d9; --t-r: 13px; --t-gap: 18px; --t-alias: var(--primary); --t-none: none; --t-deep: var(--t-brand); }
      .v-a { background: var(--t-brand); border-radius: var(--t-r); padding: var(--t-gap); }
      .v-b { color: var(--t-alias); box-shadow: var(--t-none); }
      .v-c { color: var(--t-deep); }
      .v-d { --shadow-glow: 0 0 40px #a855f7; --text-muted: #666666; --avatar-3: #986f0b; }
      .v-e { box-shadow: var(--shadow-glow); color: var(--text-muted); }
      .v-f { color: var(--avatar-3); }
    </style><div class="v"><div class="v-a">A</div><div class="v-b">B</div><div class="v-c">C</div></div>
    <div class="v-d"><div class="v-e">E</div><div class="v-f">F</div></div>`);
    expect(mine().map(([rule, , detail]) => [rule, detail])).toEqual([
      ["off-theme", expect.stringMatching(/^\.v-a sets background: var\(--t-brand\), a fixed colour; use var\(--[\w-]+\) \(bg-[\w-]+\)$/)],
      ["off-theme", expect.stringMatching(/^\.v-a sets border-radius: var\(--t-r\), a fixed radius; use .+ \(rounded-\w+\)$/)],
      ["off-scale", ".v-a sets padding: var(--t-gap), a fixed spacing; use calc(var(--spacing) * 5) (p-5)"],
      ["off-theme", expect.stringMatching(/^\.v-c sets color: var\(--t-deep\), a fixed colour; use var\(--[\w-]+\) \(text-[\w-]+\)$/)],
      ["off-theme", expect.stringMatching(/^\.v-e sets box-shadow: var\(--shadow-glow\), a fixed shadow; use one of the theme's shadows/)],
      ["off-theme", expect.stringMatching(/^\.v-e sets color: var\(--text-muted\), a fixed colour; use var\(--[\w-]+\) \(text-[\w-]+\)$/)],
    ]);
  });

  it("finds Tailwind's palette in a utility's own variables and in a gradient, and leaves a pill drawn with infinity alone", () => {
    render(`<style>
      @layer utilities {
        .t-from { --tw-gradient-from: var(--color-indigo-500); }
        .t-ring { --tw-ring-color: var(--color-blue-500); --tw-ring-offset-width: 2px; }
        .t-pill { border-radius: calc(infinity * 1px); }
      }
      .t-own { --tw-shadow-color: var(--color-red-500); }
      .t-grad { background-image: linear-gradient(var(--color-rose-500), transparent); }
    </style><div class="t-from">From</div><div class="t-ring">Ring</div><div class="t-pill">Pill</div><div class="t-own">Own</div><div class="t-grad">Grad</div>`);
    expect(mine().map(([, element, detail]) => [element, detail])).toEqual([
      ['div.t-from "From"', expect.stringMatching(/^\.t-from sets --tw-gradient-from: var\(--color-indigo-500\), a fixed colour; use var\(--[\w-]+\)$/)],
      ['div.t-ring "Ring"', expect.stringMatching(/^\.t-ring sets --tw-ring-color: var\(--color-blue-500\), a fixed colour; use var\(--[\w-]+\)$/)],
      ['div.t-grad "Grad"', expect.stringMatching(/^\.t-grad sets background: linear-gradient\(var\(--color-rose-500\), transparent\), a fixed colour; use var\(--[\w-]+\) \(bg-[\w-]+\)$/)],
    ]);
  });

  it("counts the app's own variable the theme is built from, or that holds a theme value, as the theme's, and judges a fallback by its variable", () => {
    render(`<style>
      .w { --t-under: #152a1c; --t-paper: #fffaf0; --t-gutter: 1.5rem; --t-ink-soft: #3d4839; --t-odd: 1.1rem; --t-corner: 3px; }
      @media (min-width: 1px) { .w { --t-gutter: 3rem; } }
      .w-theme { --muted: var(--t-under); --card: #fffaf0; }
      .w-a { background: var(--t-under); padding: 0 var(--t-gutter); color: var(--t-paper); }
      .w-b { color: var(--t-ink-soft); margin: var(--t-odd); border-radius: var(--t-corner); }
      .w-c { background-color: #1e3d284d; @supports (color: color-mix(in lab, red, red)) { background-color: color-mix(in oklab, var(--t-under) 30%, transparent); } }
      .w-d { background-color: #abcdef; }
    </style><div class="w w-theme"><div class="w-a">A</div><div class="w-b">B</div><div class="w-c">C</div><div class="w-d">D</div></div>`);
    expect(mine().map(([rule, , detail]) => [rule, detail])).toEqual([
      ["off-theme", expect.stringMatching(/^\.w-b sets color: var\(--t-ink-soft\), a fixed colour; use var\(--[\w-]+\) \(text-[\w-]+\)$/)],
      ["off-scale", ".w-b sets margin: var(--t-odd), a fixed spacing; use calc(var(--spacing) * 4) (m-4)"],
      ["off-theme", expect.stringMatching(/^\.w-b sets border-radius: var\(--t-corner\), a fixed radius; use .+ \(rounded-\w+\)$/)],
      ["off-theme", expect.stringMatching(/^\.w-d sets background: rgb\(171, 205, 239\), a fixed colour; use var\(--[\w-]+\) \(bg-[\w-]+\)$/)],
    ]);
  });

  it("matches a nested rule by its resolved selector, and a rule scoped to a theme the run isn't in, named by the role's own token", () => {
    render(`<style>
      .n-card { & .n-title { color: #ff00aa; } .n-body { color: #00aaff; } }
      .n-x, .n-list { & .n-item { color: #aa00ff; } }
      .dark .n-dark { background-color: #111111; }
      [data-theme="abyss"] .n-abyss { border-color: #222222; border-style: solid; }
      .n-v:where(.dark, .dark *) { color: #eeeeee; }
      .dark > .n-child { color: #dddddd; }
    </style>
    <div class="n-card"><span class="n-title" data-ouro-allow="off-theme" data-ouro-allow-why="A brand mark">Title</span><span class="n-body">Body</span></div>
    <ul class="n-list"><li class="n-item">Item</li></ul><div class="n-dark">Dark</div><div class="n-abyss">Abyss</div><div class="n-v">Variant</div><div class="n-child">Child</div>`);
    expect(mine().map(([, element, detail]) => [element, detail])).toEqual([
      ['span.n-body "Body"', expect.stringMatching(/^\.n-card \.n-body sets color: rgb\(0, 170, 255\), a fixed colour; use var\(--[\w-]+\) \(text-[\w-]+\)$/)],
      ['li.n-item "Item"', expect.stringMatching(/^:is\(\.n-x, \.n-list\) \.n-item sets color: rgb\(170, 0, 255\), a fixed colour; use var\(--[\w-]+\) \(text-[\w-]+\)$/)],
      ['div.n-dark "Dark"', ".dark .n-dark sets background: rgb(17, 17, 17), a fixed colour; use var(--card) (bg-card)"],
      ['div.n-abyss "Abyss"', '[data-theme="abyss"] .n-abyss sets border-color: rgb(34, 34, 34), a fixed colour; use var(--border) (border-border)'],
      ['div.n-v "Variant"', ".n-v:where(.dark, .dark *) sets color: rgb(238, 238, 238), a fixed colour; use var(--foreground) (text-foreground)"],
      ['div.n-child "Child"', ".dark > .n-child sets color: rgb(221, 221, 221), a fixed colour; use var(--foreground) (text-foreground)"],
    ]);
  });
});

