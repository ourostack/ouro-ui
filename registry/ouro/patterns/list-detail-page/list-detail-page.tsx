"use client";

import { useEffect, useLayoutEffect, useRef, useState, type SVGProps } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ColorSchemeToggle } from "@/registry/ouro/components/ouro/color-scheme-toggle/color-scheme-toggle";
import { Empty } from "@/registry/ouro/components/ouro/empty/empty";
import { Item } from "@/registry/ouro/components/ouro/item/item";
import { ItemGroup } from "@/registry/ouro/components/ouro/item/item-group";
import { PageHeader } from "@/registry/ouro/components/ouro/page-header/page-header";
import { Stack } from "@/registry/ouro/components/ouro/stack/stack";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { AFTER_ACTION_MS, announce } from "@/registry/ouro/lib/ouro/announce";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useMediaQuery } from "@/registry/ouro/lib/ouro/use-media-query";

/** One entry of the list, and what its detail shows. Replace it with your app's records. */
export interface Entry {
  id: string;
  title: string;
  summary: string;
  body: string;
  updated: string;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

// Points back, so in a right-to-left page it points the other way.
function BackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props} className={cn(props.className, "rtl:-scale-x-100")}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

// Made-up entries to show the page; replace them with your own.
const sampleEntries: Entry[] = [
  { id: "ribs", title: "Braised short ribs", summary: "Four hours, mostly hands-off", body: "Sear the ribs hard, then braise them low in red wine and stock until they fall from the bone.", updated: "Jun 28" },
  { id: "cake", title: "Lemon olive oil cake", summary: "One hour", body: "Whisk the eggs and sugar pale, fold in the zest, flour and oil, and bake until it springs back.", updated: "Jun 27" },
  { id: "soup", title: "Lentil soup", summary: "Forty minutes", body: "Soften onion, carrot and celery, add lentils and stock, and simmer until they break down.", updated: "Jun 25" },
];

/**
 * A whole list-and-detail page: a header with the light and dark toggle, a list you can
 * search, and the detail of the entry chosen beside it. On a phone the list comes first,
 * and choosing an entry shows its detail with a way back. It draws itself from Ouro's
 * theme, with layout classes only. Render it with your entries, then change the detail to
 * what your app shows.
 *
 * What it already does, which Ouro's own tests cover, so your tests need only cover what
 * you add: pressing a row shows its entry, marks the row shown (on a phone, only while the entry
 * shows in the list's place) and, beside the list, says which entry is showing; the search narrows the
 * list and says when nothing matches; on a phone the detail replaces the list, focus moves
 * to its heading, and Back returns to the row.
 *
 * What the app wires up: the toggle needs `ColorSchemeProvider` around the app, and the
 * script that sets light or dark before the first paint, as the agent quickstart sets up:
 * https://ui.ouroboros.bot/docs/agent-quickstart.md.
 *
 * To change it, edit this file: the `Entry` type, the sample entries and the detail. The
 * parts it uses take:
 * - `Item`: `title`, `description`, `selected` and `onSelect`, which makes the row a button.
 * - `ItemGroup`: `label` or `aria-label`, `variant`, and `empty`, what shows in place of the rows.
 * - `TextField`: `label` (with `hideLabel`), `type="search"`, `clearable`, `value`, `onChange`.
 * - `Empty`: `title`, `description`. `Heading`: `level`, `size`. `Text`: `size`, `tone`.
 * - `PageHeader`: `title`, `description`, `actions`. `Button`: `variant`. `Stack`: `gap`.
 * A component's whole API is on its page, https://ui.ouroboros.bot/docs/<item>.md.
 *
 * @claim "What it already does, which Ouro's own" test/patterns.test.tsx verify:testExists(test/patterns.test.tsx::ListDetailPage > on a phone marks a row shown only while its entry shows in the list's place)
 * @claim "What it already does, which Ouro's own" test/patterns.test.tsx verify:testExists(test/patterns.test.tsx::ListDetailPage > shows the entry a row's press chooses, and marks that row shown)
 * @claim "What it already does, which Ouro's own" test/patterns.test.tsx verify:testExists(test/patterns.test.tsx::ListDetailPage > says which entry is showing when a row is chosen beside the list, where focus stays in the list, and says nothing on a phone, where focus moves to the heading)
 * @claim "What it already does, which Ouro's own" test/patterns.test.tsx verify:testExists(test/patterns.test.tsx::ListDetailPage > narrows the list as you search, says how many match to a screen reader, and says when nothing matches)
 * @claim "What it already does, which Ouro's own" test/patterns.test.tsx verify:testExists(test/patterns.test.tsx::ListDetailPage > on a phone shows the list first, the detail in its place once chosen with focus on its heading, and Back to the row)
 *
 * @example
 * import { ListDetailPage } from "@/components/patterns/list-detail-page";
 * <ListDetailPage entries={recipes} />
 */
export function ListDetailPage({
  entries = sampleEntries,
  title = "Recipes",
}: {
  /** The entries to list, in order. */
  entries?: readonly Entry[];
  /** The page's title, which also names the list. */
  title?: string;
}) {
  const [openId, setOpenId] = useState(entries[0]?.id);
  const [query, setQuery] = useState("");
  // On a phone, whether the detail is showing in place of the list.
  const [reading, setReading] = useState(false);
  // After Back on a phone: the list is back, and focus is still on Back until the list has been on the page a frame.
  const [returning, setReturning] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const words = query.trim().toLowerCase();
  const shown = entries.filter((entry) => `${entry.title} ${entry.summary}`.toLowerCase().includes(words));
  // What the search found, for a screen reader, which the list's change alone does not say. Its status region takes it
  // once the person stops typing (AFTER_ACTION_MS after the last key): taken at the first key, it changed while VoiceOver
  // echoed that key, which dropped it (ourostack/ouro-ui#2086). Each key clears it and starts the wait over.
  const found = words ? `${shown.length} ${shown.length === 1 ? "match" : "matches"}` : "";
  const [settled, setSettled] = useState<{ query: string; found: string } | null>(null);
  useEffect(() => {
    if (!found) return;
    const timer = setTimeout(() => setSettled({ query, found }), AFTER_ACTION_MS);
    return () => clearTimeout(timer);
  }, [query, found]);
  const said = settled?.query === query ? settled.found : "";
  // The entry chosen, or the first while none is (entries that arrive later, or the chosen one gone).
  const open = entries.find((entry) => entry.id === openId) ?? entries[0];
  // On a phone the detail shows in the list's place while there is one to read.
  const inPlace = reading && open !== undefined;
  // Beside the list (md and wider) the chosen entry always shows; on a phone, only in the list's place.
  const wide = useMediaQuery("(min-width: 48rem)", true);
  const showing = wide || inPlace ? open : undefined;
  // Where focus goes once the press's change is in the page. It moves in the same task as the commit, before the
  // browser's own fix-up: the focused row or Back button is hidden by that commit, and a browser that put focus on
  // the page in between would have a screen reader start reading the page, cut off by the move that follows.
  const focusNext = useRef<"heading" | null>(null);
  useLayoutEffect(() => {
    const target = focusNext.current;
    focusNext.current = null;
    // Where the detail took the list's place (a phone, or text set large), focus follows it there.
    if (target === "heading" && list.current?.checkVisibility() === false) heading.current?.focus();
  });
  // Back brings the list back while focus stays on Back, whose detail is kept, unseen and out of the way, so focus
  // never falls to the page. Focus moves to the row, or to the search when a search has left the row out, once the
  // list has been on the page for a frame: a screen reader that refreshes its view of the page as the list comes back
  // (NVDA's browse mode) would otherwise break off the row's announcement to read it again (#2012).
  useEffect(() => {
    if (!returning) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        (rows.current.get(open!.id) ?? search.current)?.focus();
        setReturning(false);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [returning, open]);
  const choose = (id: string) => {
    focusNext.current = "heading";
    setOpenId(id);
    setReading(true);
    // Beside the list focus stays on the row, so the detail changing would go unsaid; on a phone focus moves to its heading.
    const chosen = entries.find((entry) => entry.id === id);
    if (wide && chosen) announce(`Showing ${chosen.title}`, { delayMs: AFTER_ACTION_MS });
  };
  const back = () => {
    setReturning(true);
    setReading(false);
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <Stack gap="lg">
        <PageHeader title={title} description="Everything you've saved." actions={<ColorSchemeToggle />} />
        <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:items-start">
          <Stack gap="md" ref={list} className={inPlace ? "max-md:hidden" : undefined}>
            <TextField
              label={`Search ${title.toLowerCase()}`}
              hideLabel
              type="search"
              placeholder="Search"
              startAdornment={<SearchIcon />}
              clearable
              ref={search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <p role="status" className="sr-only">
              {said}
            </p>
            <ItemGroup
              aria-label={title}
              variant="plain"
              empty={words && <Empty title="Nothing matches" description="Try other words." variant="plain" align="start" headingLevel={2} />}
            >
              {shown.map((entry) => (
                <Item
                  key={entry.id}
                  title={entry.title}
                  description={entry.summary}
                  size="sm"
                  selected={entry.id === showing?.id}
                  onSelect={() => choose(entry.id)}
                  buttonRef={(node) => void (node ? rows.current.set(entry.id, node) : rows.current.delete(entry.id))}
                />
              ))}
            </ItemGroup>
          </Stack>
          <section aria-label={open?.title ?? title} className={open && !inPlace ? (returning ? "max-md:pointer-events-none max-md:absolute max-md:opacity-0" : "max-md:hidden") : undefined}>
            {open ? (
              <Stack gap="md">
                <div className="md:hidden">
                  <Button variant="plain" startIcon={BackIcon} onClick={back}>
                    {`Back to ${title.toLowerCase()}`}
                  </Button>
                </div>
                <Stack gap="xs">
                  <Heading level={2} size="xl" ref={heading} tabIndex={-1}>
                    {open.title}
                  </Heading>
                  <Text size="sm" tone="muted">
                    {open.summary} · Updated {open.updated}
                  </Text>
                </Stack>
                <Text>{open.body}</Text>
              </Stack>
            ) : (
              <Empty title={`No ${title.toLowerCase()} yet`} description="What you save shows here." variant="plain" align="start" headingLevel={2} />
            )}
          </section>
        </div>
      </Stack>
    </main>
  );
}
