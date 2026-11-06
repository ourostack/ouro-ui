import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { commands, server } from "vitest/browser";
import { ScrollArea } from "@/registry/ouro/components/ouro/scroll-area/scroll-area";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// How many elements Chromium restyles when one row comes into a long list inside a component: the row's own, not the list's.
// A rule whose subject is any element under a `:has()` (Tailwind's `group-has-*`) restyles everything inside its anchor on
// each insertion or removal there. Chromium only: the count comes from its trace (test/restyle-commands.ts).

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});

const frame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));

/** The elements restyled as each of three rows comes into a list of 200, rendered by `list`. */
async function restylesPerRow(list: (count: number) => React.ReactNode): Promise<number[]> {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(list(200)));
  for (let at = 0; at < 3; at++) await frame();
  const counts: number[] = [];
  for (const count of [201, 202, 203]) {
    await commands.startRestyleTrace();
    flushSync(() => root!.render(list(count)));
    await frame();
    await frame();
    counts.push(await commands.stopRestyleTrace());
  }
  return counts;
}

/** A row of a few elements, as a list's rows have. */
const rows = (count: number) => (
  <ul>
    {Array.from({ length: count }, (_, at) => (
      <li key={at}>
        <span>Row</span> <b>{at}</b>
      </li>
    ))}
  </ul>
);

it("restyles only the row that comes into a list of 200 in a ScrollArea, not the list", async ({ annotate, skip }) => {
  skip(server.browser !== "chromium", "the count comes from Chromium's trace");
  const counts = await restylesPerRow((count) => (
    <ScrollArea label="Rows" className="h-96">
      {rows(count)}
    </ScrollArea>
  ));
  await annotate(`elements restyled as each of 3 rows comes into a list of 200 in a ScrollArea: ${counts.join(", ")}`);
  // A row is three elements; the rest is the area's own (its scrollbar's size), however long the list.
  for (const count of counts) expect(count).toBeLessThanOrEqual(30);
});
