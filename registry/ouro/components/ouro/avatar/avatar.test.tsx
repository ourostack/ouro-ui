import { type CSSProperties, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { Avatar, AvatarGroup } from "@/registry/ouro/components/ouro/avatar/avatar";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { audit, describeFindings } from "@/registry/ouro/lib/ouro/testing/axe";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get avatar() {
      return host.querySelector<HTMLElement>('[data-ouro="avatar"]')!;
    },
    get group() {
      return host.querySelector<HTMLElement>('[data-ouro="avatar-group"]')!;
    },
  };
}

// A 2x2 PNG that always loads, and an address that never does.
const photo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4AWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
const broken = "data:image/png;base64,broken";

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("Avatar", () => {
  it("shows initials from the name, and the name to screen readers", async () => {
    const { avatar } = await render(<Avatar name="Ada King Lovelace" />);
    expect(avatar.getAttribute("role")).toBe("img");
    expect(avatar.getAttribute("aria-label")).toBe("Ada King Lovelace");
    expect(avatar.textContent).toBe("AL");
    await expect.element(page.getByRole("img", { name: "Ada King Lovelace" })).toBeVisible();
  });

  it.each([
    ["Ada", "A"],
    ["  grace   hopper ", "GH"],
    ["Émile Zola", "ÉZ"],
    ["😀 Smile", "😀S"],
    ["", ""],
  ])("derives initials from %j as %j", async (name, initials) => {
    const { avatar } = await render(<Avatar name={name} />);
    expect(avatar.textContent).toBe(initials);
  });

  it("takes initials and alt that override the name", async () => {
    const { avatar } = await render(<Avatar name="Ada Lovelace" initials="AdL" alt="Ada, the author" />);
    expect(avatar.textContent).toBe("AdL");
    expect(avatar.getAttribute("aria-label")).toBe("Ada, the author");
  });

  it("is hidden from assistive technology with an empty alt", async () => {
    const { avatar } = await render(<Avatar name="Ada Lovelace" alt="" />);
    expect(avatar.getAttribute("aria-hidden")).toBe("true");
    expect(avatar.hasAttribute("role")).toBe(false);
    expect(avatar.hasAttribute("aria-label")).toBe(false);
  });

  it("shows the image once it loads", async () => {
    const { avatar } = await render(<Avatar name="Ada Lovelace" src={photo} />);
    await expect.poll(() => avatar.querySelector("img")).not.toBeNull();
    const img = avatar.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("src")).toBe(photo);
    expect(avatar.textContent).toBe("");
    expect(avatar.getAttribute("aria-label")).toBe("Ada Lovelace");
    expect(getComputedStyle(img).objectFit).toBe("cover");
  });

  it("falls back to initials when the image fails", async () => {
    const { avatar } = await render(<Avatar name="Ada Lovelace" src={broken} />);
    await expect.poll(() => avatar.getAttribute("data-image")).toBe("error");
    expect(avatar.querySelector("img")).toBeNull();
    expect(avatar.textContent).toBe("AL");
  });

  it("renders initials in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <Avatar name="Ada Lovelace" src={photo} />;
    const html = renderToString(node);
    expect(html).toContain('aria-label="Ada Lovelace"');
    expect(html).toContain(">AL<");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    await expect.poll(() => host.querySelector("img")).not.toBeNull();
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("comes in sizes that grow in order, as circles", async () => {
    const sizes = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl"] as const;
    const { host } = await render(
      <>
        {sizes.map((size) => (
          <Avatar key={size} name="Ada Lovelace" size={size} />
        ))}
      </>,
    );
    const avatars = [...host.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')];
    const widths = avatars.map((avatar) => avatar.getBoundingClientRect().width);
    expect(widths).toEqual([24, 32, 40, 48, 64, 72, 112]);
    const fonts = avatars.map((avatar) => parseFloat(getComputedStyle(avatar).fontSize));
    expect([...fonts].sort((a, b) => a - b)).toEqual(fonts);
    // The initials keep roughly the same share of the circle at every size.
    for (const index of widths.keys()) expect(fonts[index]! / widths[index]!).toBeGreaterThan(0.29);

    for (const avatar of avatars) expect(avatar.getBoundingClientRect().height).toBe(avatar.getBoundingClientRect().width);
    expect(getComputedStyle(avatars[0]!).borderRadius).not.toBe("0px");
  });

  it("forwards a ref and lets app layout classes win", async () => {
    let element: HTMLElement | null = null;
    const { avatar } = await render(<Avatar name="Ada" className="ms-2" ref={(node) => void (element = node)} />);
    expect(element).toBe(avatar);
    expect(getComputedStyle(avatar).marginInlineStart).toBe("8px");
  });
});

// Colors as the browser resolves them, through a 1px canvas, as in the theme's contrast test.
type Rgb = [number, number, number];
const canvas = document.createElement("canvas");
canvas.width = canvas.height = 1;
const context = canvas.getContext("2d", { willReadFrequently: true })!;
function toRgb(color: string): Rgb {
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r!, g!, b!];
}
const luminance = ([r, g, b]: Rgb) => {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
/** A theme variable's color, as the page resolves it. */
function token(name: string): string {
  const probe = document.createElement("i");
  probe.style.color = `var(--${name})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

const names = Array.from({ length: 48 }, (_, index) => `Person ${index} Example`);

describe("Avatar colors", () => {
  afterEach(() => document.documentElement.classList.remove("dark"));

  it("picks the same hue for the same name, and spreads names across the hues", async () => {
    const { host } = await render(
      <>
        {names.map((name) => (
          <Avatar key={name} name={name} />
        ))}
        <Avatar name="Ada Lovelace" />
        <Avatar name="  ada lovelace " />
      </>,
    );
    const avatars = [...host.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')];
    const backgrounds = avatars.map((avatar) => getComputedStyle(avatar).backgroundColor);
    expect(new Set(backgrounds.slice(0, names.length)).size).toBe(8);
    expect(backgrounds.at(-1)).toBe(backgrounds.at(-2));
    expect(backgrounds).not.toContain(token("secondary"));
  });

  it("maps each name to its hue, the same in every browser and on the server", async () => {
    // FNV-1a over the trimmed, lowercased name, mixed by MurmurHash3's finalizer, scaled from its top bits to the eight hues.
    const expected = [
      ["Jean Sammet", 1],
      ["Ada Lovelace", 2],
      ["Alan Turing", 3],
      ["Dennis Ritchie", 4],
      ["Grace Hopper", 5],
      ["Radia Perlman", 6],
      ["Katherine Johnson", 7],
      ["Ken Thompson", 8],
      ["Lynn Conway", 1],
      ["Edsger Dijkstra", 5],
      ["Sophie Wilson", 3],
      ["😀 Smile", 4],
      ["Émile Zola", 6],
    ] as const;
    const { host } = await render(
      <>
        {expected.map(([name]) => (
          <Avatar key={name} name={name} />
        ))}
      </>,
    );
    const avatars = [...host.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')];
    for (const [index, [, hue]] of expected.entries()) {
      const probe = document.createElement("i");
      probe.style.backgroundColor = `color-mix(in oklab, var(--avatar-${hue}) 18%, var(--background))`;
      probe.style.color = `color-mix(in oklab, var(--avatar-${hue}) 70%, var(--foreground))`;
      document.body.append(probe);
      const want = getComputedStyle(probe);
      expect(getComputedStyle(avatars[index]!).backgroundColor).toBe(want.backgroundColor);
      expect(getComputedStyle(avatars[index]!).color).toBe(want.color);
      probe.remove();
    }
  });

  it("spreads ids that differ only in their last character across the hues", async () => {
    const sequential = Array.from({ length: 16 }, (_, index) => `user-${String(index).padStart(4, "0")}`);
    const hex = Array.from({ length: 16 }, (_, index) => `8f14e45f-ceea-467f-a0e6-00000000000${index.toString(16)}`);
    const { host } = await render(
      <>
        {[...sequential, ...hex].map((id) => (
          <Avatar key={id} name="Sam Example" idForColor={id} />
        ))}
      </>,
    );
    const backgrounds = [...host.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')].map((avatar) => getComputedStyle(avatar).backgroundColor);
    expect(new Set(backgrounds.slice(0, 16)).size).toBe(8);
    expect(new Set(backgrounds.slice(16)).size).toBe(6);
  });

  it("picks the hue from idForColor when given, so one name can take two colors", async () => {
    const { host } = await render(
      <>
        {names.slice(0, 8).map((name) => (
          <Avatar key={name} name="Sam Example" idForColor={name} />
        ))}
      </>,
    );
    const backgrounds = [...host.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')].map((avatar) => getComputedStyle(avatar).backgroundColor);
    expect(new Set(backgrounds).size).toBeGreaterThan(1);
  });

  it.each(["light", "dark"] as const)("keeps the initials at least 4.5:1 on every hue and on brand (%s)", async (scheme) => {
    document.documentElement.classList.toggle("dark", scheme === "dark");
    const { host } = await render(
      <>
        {names.map((name) => (
          <Avatar key={name} name={name} />
        ))}
        <Avatar name="Ada Lovelace" color="brand" />
      </>,
    );
    const avatars = [...host.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')];
    for (const avatar of avatars) {
      const style = getComputedStyle(avatar);
      expect(ratio(toRgb(style.color), toRgb(style.backgroundColor))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("tints with the theme's primary for brand, and uses the secondary surface for neutral", async () => {
    const { host } = await render(
      <>
        <Avatar name="Ada Lovelace" color="brand" />
        <Avatar name="Ada Lovelace" color="neutral" />
      </>,
    );
    const [brand, neutral] = [...host.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')].map((avatar) => getComputedStyle(avatar));
    const probe = document.createElement("i");
    probe.style.backgroundColor = "color-mix(in oklab, var(--primary) 18%, var(--background))";
    probe.style.color = "color-mix(in oklab, var(--primary) 70%, var(--foreground))";
    document.body.append(probe);
    expect(brand!.backgroundColor).toBe(getComputedStyle(probe).backgroundColor);
    expect(brand!.color).toBe(getComputedStyle(probe).color);
    probe.remove();
    expect(neutral!.backgroundColor).toBe(token("secondary"));
    expect(neutral!.color).toBe(token("secondary-foreground"));
  });
});

describe("Avatar shapes and icons", () => {
  it("is a circle by default and a rounded square for a team", async () => {
    const { host } = await render(
      <>
        <Avatar name="Ada Lovelace" size="lg" />
        <Avatar name="Design reviews" shape="square" size="lg" />
      </>,
    );
    const [circle, square] = [...host.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')];
    expect(circle!.getAttribute("data-shape")).toBe("circle");
    expect(square!.getAttribute("data-shape")).toBe("square");
    expect(parseFloat(getComputedStyle(circle!).borderTopLeftRadius)).toBeGreaterThanOrEqual(24);
    const corner = parseFloat(getComputedStyle(square!).borderTopLeftRadius);
    expect(corner).toBeGreaterThan(0);
    expect(corner).toBeLessThan(16);
  });

  it("rounds a square's corners more as it grows", async () => {
    const sizes = ["xs", "md", "xl", "3xl"] as const;
    const { host } = await render(
      <>
        {sizes.map((size) => (
          <Avatar key={size} name="Design reviews" shape="square" size={size} />
        ))}
      </>,
    );
    const corners = [...host.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')].map((avatar) => parseFloat(getComputedStyle(avatar).borderTopLeftRadius));
    expect([...corners].sort((a, b) => a - b)).toEqual(corners);
    expect(corners[0]).toBeLessThan(corners.at(-1)!);
  });

  it("clips a square's picture to its corners", async () => {
    const { avatar } = await render(<Avatar name="Design reviews" shape="square" src={photo} />);
    await expect.poll(() => avatar.querySelector("img")).not.toBeNull();
    expect(getComputedStyle(avatar.querySelector("img")!).borderTopLeftRadius).toBe(getComputedStyle(avatar).borderTopLeftRadius);
  });

  it("shows an icon instead of initials, keeping the name for screen readers", async () => {
    const { avatar } = await render(
      <Avatar
        name="Weekly sync"
        color="brand"
        icon={
          <svg data-testid="calendar" viewBox="0 0 20 20">
            <rect width="20" height="20" />
          </svg>
        }
      />,
    );
    expect(avatar.textContent).toBe("");
    expect(avatar.getAttribute("aria-label")).toBe("Weekly sync");
    const icon = avatar.querySelector<SVGElement>('[data-testid="calendar"]')!;
    expect(icon.getBoundingClientRect().width).toBe(22);
    // Centered in the avatar.
    const box = avatar.getBoundingClientRect();
    const mark = icon.getBoundingClientRect();
    expect(mark.left - box.left).toBeCloseTo(box.right - mark.right, 0);
    expect(mark.top - box.top).toBeCloseTo(box.bottom - mark.bottom, 0);
  });
});

describe("Avatar presence", () => {
  it.each(["light", "dark"] as const)("keeps the initials 4.5:1 beside every presence dot at every size, wherever the avatar lands on the pixel grid (%s)", async (scheme) => {
    document.documentElement.classList.toggle("dark", scheme === "dark");
    const { host } = await render(
      <>
        {[0, 0.25, 0.5, 0.75].map((offset) => (
          <div key={offset} style={{ display: "flex", gap: 12, alignItems: "center", paddingTop: offset, paddingLeft: offset }}>
            {(["xs", "sm", "md", "lg", "xl", "2xl", "3xl"] as const).flatMap((size) =>
              (["available", "away", "busy", "out-of-office"] as const).map((presence) => (
                <Avatar key={size + presence} name="Mona Example" initials="MW" idForColor="person-0101" size={size} presence={presence} presenceLabel={presence} />
              )),
            )}
          </div>
        ))}
      </>,
    );
    try {
      expect(describeFindings(await audit({ include: [host] }))).toBe("");
    } finally {
      document.documentElement.classList.remove("dark");
    }
  });

  it.each(["xs", "sm", "md", "lg", "xl", "2xl", "3xl"] as const)("keeps wide initials clear of the presence dot (%s)", async (size) => {
    const { host } = await render(
      <>
        <Avatar name="Mona Example" initials="MW" size={size} data-plain="" />
        {["MW", "WM", "ME", "WW"].map((initials) => (
          <Avatar key={initials} name="Mona Example" initials={initials} size={size} presence="busy" presenceLabel="Busy" />
        ))}
      </>,
    );
    // Without a dot, the initials stay in the middle.
    const plain = host.querySelector<HTMLElement>("[data-plain]")!;
    const plainBox = plain.getBoundingClientRect();
    const plainRange = document.createRange();
    plainRange.selectNodeContents(plain.firstElementChild!);
    const plainText = plainRange.getClientRects()[0]!;
    expect(Math.abs(plainBox.left + plainBox.width / 2 - (plainText.left + plainText.width / 2))).toBeLessThan(1);
    expect(Math.abs(plainBox.top + plainBox.height / 2 - (plainText.top + plainText.height / 2))).toBeLessThan(1.5);
    for (const avatar of host.querySelectorAll<HTMLElement>('[data-ouro="avatar"][data-presence]')) {
      const dot = avatar.querySelector<HTMLElement>("[data-ouro-avatar-presence]")!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(avatar.firstElementChild!);
      for (const text of range.getClientRects()) {
        // Half a pixel clear above the dot, for this font's line and for any line up to 1.3em tall.
        const tallest = text.top + text.height / 2 + 0.65 * parseFloat(getComputedStyle(avatar).fontSize);
        expect(dot.top - Math.max(text.bottom, tallest), `${size} ${avatar.textContent}: text ${JSON.stringify(text)} dot ${JSON.stringify(dot)}`).toBeGreaterThanOrEqual(0.5);
        // The small sizes lean away from the dot, toward the start.
        const box = avatar.getBoundingClientRect();
        const lean = box.left + box.width / 2 - (text.left + text.width / 2);
        if (["xs", "sm", "md"].includes(size)) expect(lean).toBeGreaterThanOrEqual(1.5);
        else expect(Math.abs(lean)).toBeLessThan(1);
      }
    }
  });

  const sizes = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl"] as const;

  it("says the presence after the name, and alone when the name is written beside it", async () => {
    const { host } = await render(
      <>
        <Avatar name="Ada Lovelace" presence="busy" presenceLabel="In a meeting" />
        <Avatar name="Ada Lovelace" alt="" presence="busy" presenceLabel="In a meeting" />
      </>,
    );
    const [named, beside] = [...host.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')];
    expect(named!.getAttribute("aria-label")).toBe("Ada Lovelace, In a meeting");
    expect(named!.getAttribute("data-presence")).toBe("busy");
    expect(beside!.getAttribute("role")).toBe("img");
    expect(beside!.getAttribute("aria-label")).toBe("In a meeting");
    await expect.element(page.getByRole("img", { name: "Ada Lovelace, In a meeting" })).toBeVisible();
  });

  it("sits on the lower end corner at every size, with a ring in the surface's color", async () => {
    const { host } = await render(
      <>
        {sizes.map((size) => (
          <Avatar key={size} name="Ada Lovelace" size={size} presence="available" presenceLabel="Available" />
        ))}
      </>,
    );
    const avatars = [...host.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')];
    const dots = avatars.map((avatar) => avatar.querySelector<HTMLElement>("[data-ouro-avatar-presence]")!);
    const widths = dots.map((dot) => dot.getBoundingClientRect().width);
    expect([...widths].sort((a, b) => a - b)).toEqual(widths);
    for (const [index, avatar] of avatars.entries()) {
      const box = avatar.getBoundingClientRect();
      const dot = dots[index]!.getBoundingClientRect();
      // A third to a sixth of the avatar, its center near the circle's edge at the corner.
      expect(dot.width / box.width).toBeGreaterThan(0.24);
      expect(dot.width / box.width).toBeLessThan(0.42);
      expect(dot.height).toBe(dot.width);
      const radius = box.width / 2;
      const center = { x: dot.left + dot.width / 2 - (box.left + radius), y: dot.top + dot.height / 2 - (box.top + radius) };
      expect(Math.abs(Math.hypot(center.x, center.y) - radius)).toBeLessThan(radius * 0.25);
      expect(center.x).toBeGreaterThan(0);
      expect(center.y).toBeGreaterThan(0);
      expect(getComputedStyle(dots[index]!).backgroundColor).toBe(token("background"));
      // The glyph fills the dot inside the ring.
      const glyph = dots[index]!.querySelector("svg")!.getBoundingClientRect();
      expect(glyph.width).toBeLessThan(dot.width);
      expect(glyph.width).toBeGreaterThanOrEqual(dot.width - 6);
    }
  });

  it("takes the ring's color from --ouro-avatar-ring, as on a card", async () => {
    const { host } = await render(
      <div style={{ "--ouro-avatar-ring": "var(--card)" } as CSSProperties}>
        <Avatar name="Ada Lovelace" presence="away" presenceLabel="Away" />
      </div>,
    );
    expect(getComputedStyle(host.querySelector<HTMLElement>("[data-ouro-avatar-presence]")!).backgroundColor).toBe(token("card"));
  });

  it("moves to the other corner right to left", async () => {
    const { host } = await render(
      <div dir="rtl">
        <Avatar name="Ada Lovelace" presence="available" presenceLabel="Available" />
      </div>,
    );
    const box = host.querySelector<HTMLElement>('[data-ouro="avatar"]')!.getBoundingClientRect();
    const dot = host.querySelector<HTMLElement>("[data-ouro-avatar-presence]")!.getBoundingClientRect();
    expect(dot.left + dot.width / 2).toBeLessThan(box.left + box.width / 2);
  });

  it("draws each state in its own shape and tone", async () => {
    const states = [
      ["available", "success"],
      ["busy", "destructive"],
      ["do-not-disturb", "destructive"],
      ["away", "warning"],
      ["offline", "muted-foreground"],
      ["out-of-office", "primary"],
    ] as const;
    const { host } = await render(
      <>
        {states.map(([presence]) => (
          <Avatar key={presence} name="Ada Lovelace" presence={presence} presenceLabel={presence} />
        ))}
      </>,
    );
    const glyphs = [...host.querySelectorAll<HTMLElement>("[data-ouro-avatar-presence] svg")];
    expect(glyphs).toHaveLength(states.length);
    // Every state draws different marks, so none relies on color alone.
    expect(new Set(glyphs.map((glyph) => glyph.innerHTML.replace(/ class="[^"]*"/g, ""))).size).toBe(states.length);
    for (const [index, [presence, tone]] of states.entries()) {
      const glyph = glyphs[index]!;
      expect(glyph.getAttribute("aria-hidden")).toBe("true");
      expect(glyph.getAttribute("focusable")).toBe("false");
      const circle = glyph.querySelector("circle")!;
      const style = getComputedStyle(circle);
      const ring = style.fill === "none";
      expect(ring).toBe(presence === "offline" || presence === "out-of-office");
      expect(ring ? style.stroke : style.fill).toBe(token(tone));
      // The circle fills the glyph's box: the drawing is scaled to the dot.
      const disc = circle.getBoundingClientRect();
      const frame = glyph.getBoundingClientRect();
      expect(disc.width).toBeGreaterThan(frame.width * (ring ? 0.8 : 0.95));
      // The marks on it are rounded strokes in the tone's foreground (or the tone, on a ring), never filled.
      for (const mark of glyph.querySelectorAll("path")) {
        const line = getComputedStyle(mark);
        expect(line.fill).toBe("none");
        expect(line.strokeLinecap).toBe("round");
        expect(line.strokeLinejoin).toBe("round");
        expect(line.stroke).toBe(token(ring ? tone : `${tone}-foreground`));
        const drawn = mark.getBBox();
        expect(Math.max(drawn.width, drawn.height)).toBeGreaterThan(4);
      }
      expect(glyph.querySelectorAll("path")).toHaveLength(presence === "busy" ? 0 : 1);
    }
  });

  it("renders the dot in server HTML", () => {
    const html = renderToString(<Avatar name="Ada Lovelace" presence="do-not-disturb" presenceLabel="Do not disturb" shape="square" />);
    expect(html).toContain('aria-label="Ada Lovelace, Do not disturb"');
    expect(html).toContain('data-presence="do-not-disturb"');
    expect(html).toContain("data-ouro-avatar-presence");
  });
});

describe("AvatarGroup", () => {
  const cooks = ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Katherine Johnson", "Edsger Dijkstra"];

  it("stacks avatars in a labeled group, overlapping", async () => {
    const { group } = await render(
      <AvatarGroup label="Cooks">
        {cooks.slice(0, 3).map((name) => (
          <Avatar key={name} name={name} />
        ))}
      </AvatarGroup>,
    );
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Cooks");
    const avatars = [...group.querySelectorAll<HTMLElement>('[data-ouro="avatar"]')];
    expect(avatars).toHaveLength(3);
    const [first, second] = avatars.map((avatar) => avatar.getBoundingClientRect());
    expect(second!.left).toBeLessThan(first!.right);
    expect(getComputedStyle(avatars[1]!).boxShadow).not.toBe("none");
    expect(group.querySelector("[data-ouro-avatar-more]")).toBeNull();
  });

  it("shows max avatars and a +N count with a spoken label", async () => {
    const { group } = await render(
      <AvatarGroup label="Cooks" max={3}>
        {cooks.map((name) => (
          <Avatar key={name} name={name} />
        ))}
      </AvatarGroup>,
    );
    expect(group.querySelectorAll('[data-ouro="avatar"]')).toHaveLength(3);
    const more = group.querySelector<HTMLElement>("[data-ouro-avatar-more]")!;
    expect(more.textContent).toBe("+22 more");
    expect(more.querySelector("[aria-hidden]")!.textContent).toBe("+2");
    await expect.element(page.getByRole("group", { name: "Cooks" })).toBeVisible();
  });

  it("counts from total when more people exist than avatars passed", async () => {
    const { group } = await render(
      <AvatarGroup label="Members" total={120} moreLabel={(count) => `${count} weitere`}>
        <Avatar name="Ada Lovelace" />
        <Avatar name="Grace Hopper" />
      </AvatarGroup>,
    );
    const more = group.querySelector<HTMLElement>("[data-ouro-avatar-more]")!;
    expect(more.textContent).toBe("+118118 weitere");
  });

  it("passes its size to every avatar and the count", async () => {
    const { group } = await render(
      <AvatarGroup label="Cooks" size="lg" max={1}>
        <Avatar name="Ada Lovelace" />
        <Avatar name="Grace Hopper" size="xs" />
      </AvatarGroup>,
    );
    const avatar = group.querySelector<HTMLElement>('[data-ouro="avatar"]')!;
    const more = group.querySelector<HTMLElement>("[data-ouro-avatar-more]")!;
    expect(avatar.getBoundingClientRect().width).toBe(48);
    expect(more.getBoundingClientRect().width).toBe(48);
  });

  it("forwards a ref and lets app layout classes win", async () => {
    let element: HTMLDivElement | null = null;
    const { group } = await render(
      <AvatarGroup label="Cooks" className="mt-4" ref={(node) => void (element = node)}>
        <Avatar name="Ada" />
      </AvatarGroup>,
    );
    expect(element).toBe(group);
    expect(getComputedStyle(group).marginTop).toBe("16px");
  });
});

describe("Avatar development messages", () => {
  it.each([
    ["children", { children: "AL" }, "Avatar takes name and initials, not children", '<Avatar name="Ada Lovelace" initials="AL" />'],
    ["fallback", { fallback: "AL" }, "fallback is not a prop", '<Avatar name="Ada Lovelace" initials="AL" />'],
    ["size", { size: "4xl" }, 'size="4xl" is not a size; use "xs", "sm", "md", "lg", "xl", "2xl", "3xl"', '<Avatar size="3xl">'],
    ["a numeric size", { size: 40 }, "size={40} is not a size; use \"xs\", \"sm\", \"md\", \"lg\", \"xl\", \"2xl\", \"3xl\"", '<Avatar size="md">'],
  ])("warns for %s with the fix", async (_name, extra, problem, fix) => {
    const props = { name: "Ada Lovelace", ...extra } as unknown as Parameters<typeof Avatar>[0];
    const { avatar } = await render(<Avatar {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Avatar: ${problem}. Fix: ${fix}.`);
    expect(avatar.textContent).toBe("AL");
    expect(avatar.getBoundingClientRect().width).toBe(40);
  });

  it.each([
    ["shape", { shape: "rounded" }, 'shape="rounded" is not a shape; use "circle", "square"', '<Avatar shape="square">'],
    ["color", { color: "blue" }, 'color="blue" is not a color; use "colorful", "brand", "neutral"', '<Avatar color="colorful">'],
    [
      "presence",
      { presence: "dnd", presenceLabel: "Do not disturb" },
      'presence="dnd" is not a presence; use "available", "busy", "away", "do-not-disturb", "offline", "out-of-office"',
      '<Avatar presence="do-not-disturb" presenceLabel="Do not disturb">',
    ],
  ])("renders the default for an unknown %s, with the fix", async (_name, extra, problem, fix) => {
    const props = { name: "Ada Lovelace", ...extra } as unknown as Parameters<typeof Avatar>[0];
    const { avatar } = await render(<Avatar {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Avatar: ${problem}. Fix: ${fix}.`);
    expect(avatar.getAttribute("data-shape")).toBe("circle");
    expect(avatar.hasAttribute("data-presence")).toBe(false);
    expect(avatar.querySelector("[data-ouro-avatar-presence]")).toBeNull();
    expect(avatar.getAttribute("aria-label")).toBe("Ada Lovelace");
  });

  it("names the presence label when it is missing, and still speaks the presence", async () => {
    const props = { name: "Ada Lovelace", presence: "out-of-office" } as unknown as Parameters<typeof Avatar>[0];
    const { avatar } = await render(<Avatar {...props} />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Avatar: presenceLabel is missing, so screen readers hear no presence. Fix: <Avatar presence="out-of-office" presenceLabel="Out of office">.',
    );
    expect(avatar.getAttribute("aria-label")).toBe("Ada Lovelace, out of office");
  });

  it("warns once when name is missing", async () => {
    const props = { src: photo } as unknown as Parameters<typeof Avatar>[0];
    const { avatar } = await render(<Avatar {...props} />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Avatar: name is missing, so screen readers hear nothing. Fix: <Avatar name="Ada Lovelace" src={url} />.');
    expect(avatar.getAttribute("aria-hidden")).toBe("true");
  });

  it.each([
    ["max", { max: 0 }, "max={0} hides every avatar", "<AvatarGroup max={3}>"],
    ["total", { total: 0, children: [<Avatar key="a" name="Ada Lovelace" />, <Avatar key="g" name="Grace Hopper" />] }, "total={0} is less than the 2 avatars passed", "<AvatarGroup total={2}>"],
    ["children", { children: "Ada" }, "AvatarGroup holds Avatars", '<AvatarGroup label="Cooks"><Avatar name="Ada Lovelace" /></AvatarGroup>'],
    ["size", { size: "huge" }, 'size="huge" is not a size; use "xs", "sm", "md", "lg", "xl", "2xl", "3xl"', '<AvatarGroup size="md">'],
  ])("warns for an AvatarGroup %s with the fix", async (_name, extra, problem, fix) => {
    const props = { label: "Cooks", children: <Avatar name="Ada Lovelace" />, ...extra } as unknown as Parameters<typeof AvatarGroup>[0];
    await render(<AvatarGroup {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] AvatarGroup: ${problem}. Fix: ${fix}.`);
  });

  it.each([
    ["rounded-md", 'shape="square"'],
    ["rounded-none", 'shape="square"'],
    ["bg-blue-500", 'remove "bg-blue-500"; Avatar colors its initials from the name, or pass color="neutral"'],
    ["text-lg", 'size="lg"'],
    ["size-12", ""],
  ])("checks the className %s", async (className, fix) => {
    await render(<Avatar name="Ada" className={className} />);
    if (fix) {
      expect(warn).toHaveBeenCalledWith(`[ouro-ui] Avatar: "${className}" sets appearance, and className is for layout only. Fix: ${fix}.`);
    } else {
      expect(warn).not.toHaveBeenCalled();
    }
  });

  it("checks the AvatarGroup className", async () => {
    await render(
      <AvatarGroup label="Cooks" className="bg-muted">
        <Avatar name="Ada" />
      </AvatarGroup>,
    );
    expect(warn).toHaveBeenCalledWith('[ouro-ui] AvatarGroup: "bg-muted" sets appearance, and className is for layout only. Fix: <div className="bg-muted"><AvatarGroup /></div>.');
  });

  it("renders to a string without warnings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(
      <AvatarGroup label="Cooks" max={1} className="bg-muted">
        <Avatar name="Ada Lovelace" className="bg-red-500" />
        <Avatar name="Grace Hopper" />
      </AvatarGroup>,
    );
    expect(html).toContain('data-ouro="avatar-group"');
    expect(html).toContain("+1");
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
