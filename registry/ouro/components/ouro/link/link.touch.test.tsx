import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "40px";
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

/** The link a tap at this point would follow, if any. */
const linkAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-ouro="link"]') ?? null;

/** The centre of a link's text. */
function centre(link: HTMLElement) {
  const rect = link.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, rect };
}

it("gives a link on its own line a 44px hit area without changing its box", async () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  const host = await render(
    <>
      <div>
        <Link href="/forgot">Forgot password?</Link>
      </div>
      <div>
        <a data-plain="" href="/forgot" className="underline">
          Forgot password?
        </a>
      </div>
    </>,
  );
  const link = host.querySelector<HTMLElement>('[data-ouro="link"]')!;
  const plain = host.querySelector<HTMLElement>("[data-plain]")!;
  const { x, y, rect } = centre(link);
  // The link is as tall and wide as a plain anchor with the same text, and so is its line.
  expect(rect.height).toBe(plain.getBoundingClientRect().height);
  expect(rect.width).toBe(plain.getBoundingClientRect().width);
  expect(link.parentElement!.getBoundingClientRect().height).toBe(plain.parentElement!.getBoundingClientRect().height);
  expect(rect.height).toBeLessThan(30);
  // 22px above the text's centre is the hit area's first row; 22px below is the first row past it.
  expect(linkAt(x, y - 22)).toBe(link);
  expect(linkAt(x, y + 21)).toBe(link);
  expect(linkAt(x, y + 22)).toBeNull();
  expect(linkAt(x, y - 23)).toBeNull();
});

it("makes a short link's hit area 44px wide as well", async () => {
  const host = await render(
    <div>
      <Link href="/edit">Edit</Link>
    </div>,
  );
  const link = host.querySelector<HTMLElement>('[data-ouro="link"]')!;
  const { x, y, rect } = centre(link);
  expect(rect.width).toBeLessThan(44);
  expect(linkAt(x - 21, y)).toBe(link);
  expect(linkAt(x + 21, y)).toBe(link);
});

it("keeps a link in running text to its own line, so it takes no tap from the link on the next line", async () => {
  const host = await render(
    <Text style={{ width: 300 }}>
      <Link href="/terms">Terms</Link>
      <br />
      <Link href="/privacy">Privacy</Link>
    </Text>,
  );
  const [terms, privacy] = [...host.querySelectorAll<HTMLElement>('[data-ouro="link"]')];
  const upper = centre(terms!);
  const lower = centre(privacy!);
  // The two lines are closer than a hit area is tall, so an extended one would overlap.
  expect(lower.y - upper.y).toBeLessThan(44);
  expect(linkAt(upper.x, upper.y)).toBe(terms);
  expect(linkAt(lower.x, lower.y)).toBe(privacy);
  // 22px below the upper link's centre is the lower link's line, and 22px above the lower one's is the upper's.
  expect(linkAt(upper.x, upper.y + 22)).not.toBe(terms);
  expect(linkAt(lower.x, lower.y - 22)).not.toBe(privacy);
  expect(linkAt(upper.x, upper.y - 22)).toBeNull();
  expect(linkAt(lower.x, lower.y + 22)).toBeNull();
});

it("extends a link that is alone in a Text when it says inline={false}", async () => {
  const host = await render(
    <Text>
      <Link href="/forgot" inline={false}>
        Forgot password?
      </Link>
    </Text>,
  );
  const link = host.querySelector<HTMLElement>('[data-ouro="link"]')!;
  const { x, y } = centre(link);
  expect(linkAt(x, y - 22)).toBe(link);
  expect(linkAt(x, y + 21)).toBe(link);
});

it("keeps a link outside a Text to its line when it says inline", async () => {
  const host = await render(
    <p>
      Read the{" "}
      <Link href="/terms" inline>
        terms
      </Link>{" "}
      first.
    </p>,
  );
  const link = host.querySelector<HTMLElement>('[data-ouro="link"]')!;
  const { x, y } = centre(link);
  expect(linkAt(x, y)).toBe(link);
  expect(linkAt(x, y - 22)).toBeNull();
  expect(linkAt(x, y + 22)).toBeNull();
});
