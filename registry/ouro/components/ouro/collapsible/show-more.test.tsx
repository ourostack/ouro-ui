import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { ShowMore, type ShowMoreProps } from "@/registry/ouro/components/ouro/collapsible/show-more";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.padding = "24px";
  host.style.width = "360px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get root() {
      return host.querySelector<HTMLElement>('[data-ouro="show-more"]')!;
    },
    get rows() {
      return [...host.querySelectorAll<HTMLLIElement>("li")];
    },
    get button() {
      return host.querySelector<HTMLElement>("[data-ouro-show-more-toggle]");
    },
  };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

const recipes = Array.from({ length: 8 }, (_, index) => `Recipe ${index + 1}`);
const linkRows = recipes.map((title) => (
  <a key={title} href={`#${title}`}>
    {title}
  </a>
));

const longText =
  "Brown the short ribs in batches, then soften the onions, carrots and celery in the fat. " +
  "Stir in the tomato paste, deglaze with red wine, return the ribs, cover with stock and braise " +
  "for three hours, until the meat falls from the bone. Rest overnight, lift off the fat, and " +
  "reheat gently before serving over polenta with gremolata on top.";

describe("ShowMore with items", () => {
  it("shows the first five items in a list, with a Show more button", async () => {
    const { root, rows, button } = await render(<ShowMore items={recipes} />);
    expect(root.getAttribute("data-ouro")).toBe("show-more");
    await expect.element(page.getByRole("list")).toBeVisible();
    expect(rows.map((row) => row.textContent)).toEqual(recipes.slice(0, 5));
    expect(button!.textContent).toBe("Show more");
  });

  it("shows initialCount items and an ordered list with ordered", async () => {
    const { host, rows } = await render(<ShowMore items={recipes} initialCount={3} ordered />);
    expect(rows).toHaveLength(3);
    expect(host.querySelector("ol")).not.toBeNull();
  });

  it("shows no button when every item fits", async () => {
    const { rows, button } = await render(<ShowMore items={recipes.slice(0, 5)} />);
    expect(rows).toHaveLength(5);
    expect(button).toBeNull();
  });

  it("reveals the rest and moves focus to the first new item's link", async () => {
    const { host, rows, button } = await render(<ShowMore items={linkRows} />);
    expect(rows).toHaveLength(5);
    await userEvent.click(button!);
    expect(host.querySelectorAll("li")).toHaveLength(8);
    expect(document.activeElement).toBe(host.querySelectorAll("li")[5]!.querySelector("a"));
    expect(button!.textContent).toBe("Show less");
  });

  it("focuses the first new item itself when it holds nothing focusable", async () => {
    const { host, button } = await render(<ShowMore items={recipes} />);
    await userEvent.click(button!);
    const sixth = host.querySelectorAll("li")[5]!;
    expect(document.activeElement).toBe(sixth);
    expect(sixth.tabIndex).toBe(-1);
  });

  it("fades the new items in, and not the first ones", async () => {
    const { host, button } = await render(<ShowMore items={recipes} />);
    const first = host.querySelector("li")!;
    expect(first.getAnimations()).toHaveLength(0);
    await userEvent.click(button!);
    const sixth = host.querySelectorAll("li")[5]!;
    expect(getComputedStyle(sixth).transitionProperty).toContain("opacity");
    expect(getComputedStyle(first).transitionProperty).not.toContain("opacity");
  });

  it("hides the rest again with Show less and keeps focus on the button", async () => {
    const { host, button } = await render(<ShowMore items={recipes} />);
    await userEvent.click(button!);
    await userEvent.click(button!);
    expect(host.querySelectorAll("li")).toHaveLength(5);
    expect(document.activeElement).toBe(button);
    expect(button!.textContent).toBe("Show more");
  });

  it("takes translated labels", async () => {
    const { button } = await render(<ShowMore items={recipes} showMoreLabel="Mehr anzeigen" showLessLabel="Weniger anzeigen" />);
    expect(button!.textContent).toBe("Mehr anzeigen");
    await userEvent.click(button!);
    expect(button!.textContent).toBe("Weniger anzeigen");
  });

  it("works from the keyboard", async () => {
    const { host, button } = await render(<ShowMore items={linkRows} />);
    button!.focus();
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(host.querySelectorAll("li")[5]!.querySelector("a"));
  });

  it("lets app layout classes win and keys rows by their own keys", async () => {
    const { root, rows } = await render(<ShowMore items={linkRows} className="mt-4" />);
    expect(getComputedStyle(root).marginTop).toBe("16px");
    expect(rows[0]!.textContent).toBe("Recipe 1");
  });

  it("renders the visible items in server HTML and hydrates without a mismatch", async () => {
    const node = <ShowMore items={linkRows} />;
    const html = renderToString(node);
    expect(html).toContain("Recipe 5");
    expect(html).not.toContain("Recipe 6");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const recoverable = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    await userEvent.click(host.querySelector<HTMLElement>("[data-ouro-show-more-toggle]")!);
    expect(host.querySelectorAll("li")).toHaveLength(8);
  });
});

/** Finishes the pending load in a `Loading` list, as the server's answer would. */
let finishLoad: () => void = () => {};

/** A list that loads three more recipes after each "Show more", up to `total`, when the test calls `finishLoad`. */
function Loading({ total = 9, onShowMore, wrap = (row) => row }: { total?: number; onShowMore?: () => void; wrap?: (row: ReactElement) => ReactNode }) {
  const [count, setCount] = useState(3);
  const [loading, setLoading] = useState(false);
  return (
    <ShowMore
      items={recipes.concat(["Recipe 9"]).slice(0, count).map((title) =>
        wrap(
          <a key={title} href={`#${title}`}>
            {title}
          </a>,
        ),
      )}
      hasMore={count < total}
      loading={loading}
      href="?after=3"
      onShowMore={() => {
        onShowMore?.();
        setLoading(true);
        finishLoad = () => {
          setCount((value) => Math.min(value + 3, total));
          setLoading(false);
        };
      }}
    />
  );
}

/**
 * What React's Flight client can hand over for an item a Server Component passed: a lazy
 * wrapper with no key, and a new object on every payload.
 */
const fromServer = (row: ReactElement) => ({ $$typeof: Symbol.for("react.lazy"), _payload: row, _init: (payload: unknown) => payload }) as unknown as ReactNode;

describe("ShowMore with items a Server Component passed", () => {
  it("knows an appended page from a replaced list, and focuses the first new item", async () => {
    const { host, button } = await render(<Loading wrap={fromServer} />);
    await userEvent.click(button!);
    await act(async () => finishLoad());
    await expect.poll(() => host.querySelectorAll("li").length).toBe(6);
    await expect.poll(() => document.activeElement).toBe(host.querySelectorAll("li")[3]!.querySelector("a"));
  });

  it("keys each row by its item's own key, so a row keeps its node when the order changes", async () => {
    const rows = (titles: string[]) => titles.map((title) => fromServer(<a key={title} href={`#${title}`}>{title}</a>));
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(<ShowMore items={rows(["Pasta", "Salad"])} />));
    const pasta = host.querySelectorAll("li")[0]!;
    expect(pasta.textContent).toBe("Pasta");
    await act(async () => root.render(<ShowMore items={rows(["Salad", "Pasta"])} />));
    expect(host.querySelectorAll("li")[1]).toBe(pasta);
    expect(pasta.textContent).toBe("Pasta");
  });
});

describe("ShowMore loading more", () => {
  it("shows every item and a Show more link to the next page", async () => {
    const { rows, button } = await render(<Loading />);
    expect(rows).toHaveLength(3);
    expect(button!.tagName).toBe("A");
    expect(button!.getAttribute("href")).toBe("?after=3");
  });

  it("calls onShowMore instead of following the link, shows it is busy, then focuses the first new item", async () => {
    const onShowMore = vi.fn();
    const { host, button } = await render(<Loading onShowMore={onShowMore} />);
    await userEvent.click(button!);
    expect(onShowMore).toHaveBeenCalledTimes(1);
    expect(location.search).not.toContain("after");
    expect(button!.getAttribute("aria-busy")).toBe("true");
    await act(async () => finishLoad());
    await expect.poll(() => host.querySelectorAll("li").length).toBe(6);
    await expect.poll(() => document.activeElement).toBe(host.querySelectorAll("li")[3]!.querySelector("a"));
    expect(button!.hasAttribute("aria-busy")).toBe(false);
  });

  it("removes the button on the last page and moves focus to the first new item", async () => {
    const { host } = await render(<Loading total={5} />);
    await userEvent.click(host.querySelector<HTMLElement>("[data-ouro-show-more-toggle]")!);
    await act(async () => finishLoad());
    await expect.poll(() => host.querySelectorAll("li").length).toBe(5);
    expect(host.querySelector("[data-ouro-show-more-toggle]")).toBeNull();
    await expect.poll(() => document.activeElement).toBe(host.querySelectorAll("li")[3]!.querySelector("a"));
  });

  it("moves focus to the last item when the last page comes back empty", async () => {
    const { host } = await render(<Loading total={3} />);
    // hasMore starts false at total 3, so render one with more and an empty answer.
    expect(host.querySelector("[data-ouro-show-more-toggle]")).toBeNull();
    function Empty() {
      const [hasMore, setHasMore] = useState(true);
      return <ShowMore items={["A", "B"]} hasMore={hasMore} onShowMore={() => setHasMore(false)} />;
    }
    const empty = await render(<Empty />);
    await userEvent.click(empty.button!);
    expect(empty.button).toBeNull();
    expect(document.activeElement).toBe(empty.host.querySelectorAll("li")[1]);
  });

  it("renders a button when there is no href, and leaves focus alone when items grow by themselves", async () => {
    const r = await render(<ShowMore items={["A", "B"]} hasMore onShowMore={() => {}} />);
    expect(r.button!.tagName).toBe("BUTTON");
    const before = document.activeElement;
    await r.rerender(<ShowMore items={["A", "B", "C"]} hasMore onShowMore={() => {}} />);
    expect(document.activeElement).toBe(before);
  });

  it("keeps focus on the button while the next page has not arrived", async () => {
    const onShowMore = vi.fn();
    const { button } = await render(<ShowMore items={["A", "B"]} hasMore onShowMore={onShowMore} />);
    await userEvent.click(button!);
    expect(onShowMore).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(button);
  });

  it("does nothing while it is already loading", async () => {
    const onShowMore = vi.fn();
    const { button } = await render(<ShowMore items={["A"]} hasMore loading onShowMore={onShowMore} />);
    // The busy button is disabled, so a real click never lands; a script click must not either.
    await act(async () => button!.click());
    expect(onShowMore).not.toHaveBeenCalled();
  });
});

describe("ShowMore focus after a load that adds nothing", () => {
  type Api = {
    setQuery: (query: string) => void;
    setCount: (count: number) => void;
    setLoading: (loading: boolean) => void;
    setHasMore: (hasMore: boolean) => void;
  };
  let api!: Api;
  function Search({ useLoading = true }: { useLoading?: boolean }) {
    const [query, setQuery] = useState("a");
    const [count, setCount] = useState(3);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    useEffect(() => {
      api = { setQuery, setCount, setLoading, setHasMore };
    }, []);
    return (
      <div>
        <input aria-label="Search recipes" />
        <ShowMore
          items={Array.from({ length: count }, (_, index) => (
            <a key={`${query}${index}`} href={`#${index}`}>
              Row {index}
            </a>
          ))}
          hasMore={hasMore}
          loading={useLoading ? loading : undefined}
          onShowMore={() => setLoading(true)}
        />
      </div>
    );
  }

  it("stops waiting when a load ends with no new items, so a later change never steals focus", async () => {
    const { host, button } = await render(<Search />);
    await userEvent.click(button!);
    // The load fails: loading ends and no items arrive.
    await act(async () => api.setLoading(false));
    const input = host.querySelector("input")!;
    input.focus();
    // A new search replaces the list with a short last page.
    await act(async () => {
      api.setHasMore(false);
      api.setCount(2);
    });
    expect(document.activeElement).toBe(input);
    await act(async () => api.setCount(6));
    expect(document.activeElement).toBe(input);
  });

  it("stops waiting when the list is replaced by a longer one, without a loading prop", async () => {
    const { host, button } = await render(<Search useLoading={false} />);
    await userEvent.click(button!);
    const input = host.querySelector("input")!;
    input.focus();
    // A new search answers before the page does, with more rows than were shown.
    await act(async () => {
      api.setQuery("b");
      api.setCount(6);
    });
    expect(document.activeElement).toBe(input);
    await act(async () => api.setCount(9));
    expect(document.activeElement).toBe(input);
  });

  it("stops waiting when the list is replaced by a shorter one, without a loading prop", async () => {
    const { host, button } = await render(<Search useLoading={false} />);
    await userEvent.click(button!);
    const input = host.querySelector("input")!;
    input.focus();
    await act(async () => api.setCount(2));
    await act(async () => api.setCount(6));
    expect(document.activeElement).toBe(input);
  });
});

describe("ShowMore from an empty list", () => {
  it("focuses the first item when the first page arrives", async () => {
    function FromEmpty() {
      const [count, setCount] = useState(0);
      const [loading, setLoading] = useState(false);
      return (
        <ShowMore
          items={recipes.slice(0, count).map((title) => (
            <a key={title} href={`#${title}`}>
              {title}
            </a>
          ))}
          hasMore={count < 6}
          loading={loading}
          onShowMore={() => {
            setLoading(true);
            finishLoad = () => {
              setCount(3);
              setLoading(false);
            };
          }}
        />
      );
    }
    const { host, button } = await render(<FromEmpty />);
    expect(host.querySelectorAll("li")).toHaveLength(0);
    await userEvent.click(button!);
    await act(async () => finishLoad());
    await expect.poll(() => host.querySelectorAll("li").length).toBe(3);
    await expect.poll(() => document.activeElement).toBe(host.querySelector("li a"));
    expect(host.querySelector("[data-ouro-show-more-status]")!.textContent).toBe("Showing 3 items");
  });

  it.each([
    ["with", true],
    ["without", false],
  ])("survives a first load that finds nothing, %s a loading prop", async (_name, useLoading) => {
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => void errors.push(event.message);
    window.addEventListener("error", onError);
    const error = vi.spyOn(console, "error").mockImplementation((...args) => void errors.push(String(args[0])));
    function EmptyForever() {
      const [done, setDone] = useState(false);
      const [loading, setLoading] = useState(false);
      return (
        <ShowMore
          items={[]}
          hasMore={!done}
          loading={useLoading ? loading : undefined}
          onShowMore={() => {
            if (!useLoading) return setDone(true);
            setLoading(true);
            finishLoad = () => {
              setDone(true);
              setLoading(false);
            };
          }}
        />
      );
    }
    // The list's name at the moment focus lands on it.
    const namedAtFocus: (string | null)[] = [];
    const onFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      if (target.getAttribute("role") === "list") namedAtFocus.push(target.getAttribute("aria-label"));
    };
    document.addEventListener("focusin", onFocus);
    try {
      const { host, button } = await render(<EmptyForever />);
      await userEvent.click(button!);
      if (useLoading) await act(async () => finishLoad());
      await expect.poll(() => host.querySelector("[data-ouro-show-more-status]")?.textContent).toBe("No more items");
      expect(host.querySelector('[data-ouro="show-more"]')).not.toBeNull();
      expect(host.querySelector("[data-ouro-show-more-toggle]")).toBeNull();
      expect(errors).toEqual([]);
      // Focus never falls to the page: it moves to the empty list, already named when it lands.
      const list = host.querySelector<HTMLElement>('[role="list"]')!;
      expect(document.activeElement).toBe(list);
      expect(namedAtFocus).toEqual(["No more items"]);
      expect(list.getAttribute("tabindex")).toBe("-1");
      expect(list.hasAttribute("aria-labelledby")).toBe(false);
      await expect.element(page.getByRole("list", { name: "No more items" })).toBeInTheDocument();
    } finally {
      window.removeEventListener("error", onError);
      document.removeEventListener("focusin", onFocus);
      error.mockRestore();
    }
  });

  it("focuses the first item without a loading prop too", async () => {
    function FromEmpty() {
      const [count, setCount] = useState(0);
      return <ShowMore items={recipes.slice(0, count)} hasMore={count < 6} onShowMore={() => setCount(3)} />;
    }
    const { host, button } = await render(<FromEmpty />);
    await userEvent.click(button!);
    await expect.poll(() => document.activeElement).toBe(host.querySelector("li"));
  });
});

describe("ShowMore announcements", () => {
  /** Every non-empty text the status region takes, in order. */
  function spoken(host: HTMLElement): string[] {
    const region = host.querySelector<HTMLElement>("[data-ouro-show-more-status]")!;
    const said: string[] = [];
    new MutationObserver(() => {
      if (region.textContent) said.push(region.textContent);
    }).observe(region, { childList: true, characterData: true, subtree: true });
    return said;
  }

  it("says how many items show after each page, through a polite status region", async () => {
    const { host, button } = await render(<Loading />);
    const region = host.querySelector<HTMLElement>("[data-ouro-show-more-status]")!;
    expect(region.getAttribute("role")).toBe("status");
    expect(region.textContent).toBe("");
    // Visually hidden, but read.
    expect(region.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    const said = spoken(host);
    await userEvent.click(button!);
    await act(async () => finishLoad());
    await expect.poll(() => said).toEqual(["Showing 6 items"]);
    await userEvent.click(host.querySelector<HTMLElement>("[data-ouro-show-more-toggle]")!);
    await act(async () => finishLoad());
    await expect.poll(() => said).toEqual(["Showing 6 items", "Showing 9 items"]);
    // The region stays after the button goes, so the last count is still read.
    expect(host.querySelector("[data-ouro-show-more-toggle]")).toBeNull();
    expect(region.isConnected).toBe(true);
  });

  it("takes the words from loadedLabel", async () => {
    const { host, button } = await render(<Loading />);
    await userEvent.click(button!);
    await act(async () => finishLoad());
    await expect.poll(() => host.querySelector("[data-ouro-show-more-status]")!.textContent).toBe("Showing 6 items");
    function Labelled() {
      const [count, setCount] = useState(2);
      return (
        <ShowMore items={recipes.slice(0, count)} hasMore={count < 4} onShowMore={() => setCount(4)} loadedLabel={(shown) => `Showing ${shown} recipes`} />
      );
    }
    const labelled = await render(<Labelled />);
    await userEvent.click(labelled.button!);
    await expect.poll(() => labelled.host.querySelector("[data-ouro-show-more-status]")!.textContent).toBe("Showing 4 recipes");
  });

  it("says there are no more items when a later page comes back empty, in the words of noMoreLabel", async () => {
    function EmptyLast({ noMoreLabel }: { noMoreLabel?: string }) {
      const [count, setCount] = useState(2);
      const [hasMore, setHasMore] = useState(true);
      return (
        <ShowMore
          items={recipes.slice(0, count)}
          hasMore={hasMore}
          noMoreLabel={noMoreLabel}
          onShowMore={() => (count === 2 ? setCount(4) : setHasMore(false))}
        />
      );
    }
    const { host, button } = await render(<EmptyLast />);
    const said = spoken(host);
    await userEvent.click(button!);
    await expect.poll(() => said).toEqual(["Showing 4 items"]);
    await userEvent.click(host.querySelector<HTMLElement>("[data-ouro-show-more-toggle]")!);
    await expect.poll(() => said).toEqual(["Showing 4 items", "No more items"]);
    expect(document.activeElement).toBe(host.querySelectorAll("li")[3]);
    const custom = await render(<EmptyLast noMoreLabel="Keine weiteren Rezepte" />);
    await userEvent.click(custom.button!);
    await userEvent.click(custom.host.querySelector<HTMLElement>("[data-ouro-show-more-toggle]")!);
    await expect.poll(() => custom.host.querySelector("[data-ouro-show-more-status]")!.textContent).toBe("Keine weiteren Rezepte");
  });

  it.each([
    ["with", true],
    ["without", false],
  ])("moves focus to the last item and says no more once when a later page is empty, %s a loading prop", async (_name, useLoading) => {
    function EmptyLater() {
      const [done, setDone] = useState(false);
      const [loading, setLoading] = useState(false);
      return (
        <ShowMore
          items={recipes.slice(0, 3)}
          hasMore={!done}
          loading={useLoading ? loading : undefined}
          onShowMore={() => {
            if (!useLoading) return setDone(true);
            setLoading(true);
            finishLoad = () => {
              setDone(true);
              setLoading(false);
            };
          }}
        />
      );
    }
    const { host, button } = await render(<EmptyLater />);
    const said = spoken(host);
    await userEvent.click(button!);
    if (useLoading) await act(async () => finishLoad());
    await expect.poll(() => document.activeElement).toBe(host.querySelectorAll("li")[2]);
    await expect.poll(() => said).toEqual(["No more items"]);
    expect(document.activeElement).not.toBe(document.body);
    // The list is not focusable while it has items.
    expect(host.querySelector('[role="list"]')!.hasAttribute("tabindex")).toBe(false);
  });

  it("names an empty list only when there is no more to load, never with a stale status", async () => {
    let search!: (items: string[], hasMore: boolean) => void;
    function Results() {
      const [state, setState] = useState({ items: recipes.slice(0, 3), hasMore: true });
      useEffect(() => {
        search = (items, hasMore) => setState({ items, hasMore });
      }, []);
      return (
        <ShowMore
          items={state.items}
          hasMore={state.hasMore}
          onShowMore={() => setState({ items: recipes.slice(0, 6), hasMore: true })}
        />
      );
    }
    const { host, button } = await render(<Results />);
    await userEvent.click(button!);
    await expect.poll(() => host.querySelector("[data-ouro-show-more-status]")!.textContent).toBe("Showing 6 items");
    const list = () => host.querySelector<HTMLElement>('[role="list"]')!;
    // A new search finds nothing, but more may still load: the list is unnamed and not focusable.
    await act(async () => search([], true));
    expect(list().hasAttribute("aria-label")).toBe(false);
    expect(list().hasAttribute("aria-labelledby")).toBe(false);
    expect(list().hasAttribute("tabindex")).toBe(false);
    // Nothing more to load: the empty list is named for that, not "Showing 6 items".
    await act(async () => search([], false));
    expect(list().getAttribute("aria-label")).toBe("No more items");
    expect(list().getAttribute("tabindex")).toBe("-1");
  });

  it("has no status region outside load mode", async () => {
    const { host } = await render(<ShowMore items={recipes} />);
    expect(host.querySelector("[data-ouro-show-more-status]")).toBeNull();
  });
});

describe("ShowMore with lines", () => {
  it("clamps long text to lines and shows Show more", async () => {
    const { root, button } = await render(<ShowMore lines={2}>{longText}</ShowMore>);
    const text = root.querySelector<HTMLElement>("[data-ouro-show-more-text]")!;
    const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
    expect(text.getBoundingClientRect().height).toBeCloseTo(lineHeight * 2, 0);
    await expect.poll(() => root.querySelector("[data-ouro-show-more-toggle]")).not.toBeNull();
    expect(button!.textContent).toBe("Show more");
  });

  it("expands to the full text and back, keeping focus on the button", async () => {
    const { root } = await render(<ShowMore lines={2}>{longText}</ShowMore>);
    await expect.poll(() => root.querySelector("[data-ouro-show-more-toggle]")).not.toBeNull();
    const button = root.querySelector<HTMLElement>("[data-ouro-show-more-toggle]")!;
    const text = root.querySelector<HTMLElement>("[data-ouro-show-more-text]")!;
    const clamped = text.getBoundingClientRect().height;
    await userEvent.click(button);
    expect(text.getBoundingClientRect().height).toBeGreaterThan(clamped);
    expect(button.textContent).toBe("Show less");
    expect(document.activeElement).toBe(button);
    await userEvent.click(button);
    expect(text.getBoundingClientRect().height).toBeCloseTo(clamped, 0);
  });

  it("shows no button when the text fits", async () => {
    const { root } = await render(<ShowMore lines={3}>Short note.</ShowMore>);
    await act(async () => {});
    expect(root.querySelector("[data-ouro-show-more-toggle]")).toBeNull();
  });

  it("shows the button once the text stops fitting", async () => {
    const r = await render(<ShowMore lines={2}>Short note.</ShowMore>);
    await r.rerender(<ShowMore lines={2}>{longText}</ShowMore>);
    await expect.poll(() => r.root.querySelector("[data-ouro-show-more-toggle]")).not.toBeNull();
  });

  it("keeps the full text for screen readers and in server HTML", () => {
    const html = renderToString(<ShowMore lines={2}>{longText}</ShowMore>);
    expect(html).toContain("gremolata");
    expect(html).not.toContain("data-ouro-show-more-toggle");
  });
});

describe("ShowMore with maxHeight", () => {
  const Tall = ({ height, link }: { height: number; link?: boolean }) => (
    <div>
      <a href="#top">Top link</a>
      <div style={{ height }} />
      {link && <a href="#bottom">Bottom link</a>}
    </div>
  );
  const fold = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-ouro-show-more-fold]")!;

  it("folds long content to maxHeight under a fade, with Show more", async () => {
    const { root } = await render(<ShowMore maxHeight={120}><Tall height={400} /></ShowMore>);
    await expect.poll(() => root.querySelector("[data-ouro-show-more-toggle]")?.textContent).toBe("Show more");
    expect(fold(root).getBoundingClientRect().height).toBeCloseTo(120, 0);
    expect(fold(root).getAttribute("data-folded")).toBe("");
    expect(getComputedStyle(fold(root)).maskImage).toContain("linear-gradient");
  });

  it("unfolds to everything and back, keeping focus on the button", async () => {
    const { root } = await render(<ShowMore maxHeight={120}><Tall height={400} /></ShowMore>);
    await expect.poll(() => root.querySelector("[data-ouro-show-more-toggle]")).not.toBeNull();
    const button = root.querySelector<HTMLElement>("[data-ouro-show-more-toggle]")!;
    await userEvent.click(button);
    expect(fold(root).getBoundingClientRect().height).toBeGreaterThan(400);
    expect(fold(root).hasAttribute("data-folded")).toBe(false);
    expect(getComputedStyle(fold(root)).maskImage).toBe("none");
    expect(button.textContent).toBe("Show less");
    expect(document.activeElement).toBe(button);
    await userEvent.click(button);
    expect(fold(root).getBoundingClientRect().height).toBeCloseTo(120, 0);
    expect(button.textContent).toBe("Show more");
    await act(async () => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(document.activeElement).toBe(button);
  });

  it("keeps the page working when it unmounts right after Show less", async () => {
    const { root, rerender } = await render(<ShowMore maxHeight={120}><Tall height={400} /></ShowMore>);
    await expect.poll(() => root.querySelector("[data-ouro-show-more-toggle]")).not.toBeNull();
    const button = root.querySelector<HTMLElement>("[data-ouro-show-more-toggle]")!;
    await userEvent.click(button);
    await act(async () => button.click());
    await rerender(null);
    await act(async () => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(document.querySelector("[data-ouro-show-more-fold]")).toBeNull();
  });

  it("shows content a little taller than maxHeight whole, with no button", async () => {
    const { root } = await render(<ShowMore maxHeight={120}><Tall height={110} /></ShowMore>);
    await expect.poll(() => fold(root).getBoundingClientRect().height).toBeGreaterThan(120);
    expect(root.querySelector("[data-ouro-show-more-toggle]")).toBeNull();
    expect(fold(root).hasAttribute("data-folded")).toBe(false);
  });

  it("folds once the content grows past maxHeight", async () => {
    const r = await render(<ShowMore maxHeight={120}><Tall height={20} /></ShowMore>);
    await act(async () => {});
    expect(r.button).toBeNull();
    await r.rerender(<ShowMore maxHeight={120}><Tall height={400} /></ShowMore>);
    await expect.poll(() => r.root.querySelector("[data-ouro-show-more-toggle]")).not.toBeNull();
  });

  it("unfolds when keyboard focus moves into the folded part", async () => {
    // Lower on the page, so the box's own place on the page counts only once.
    const { root } = await render(
      <div style={{ marginTop: 300 }}>
        <ShowMore maxHeight={120} showMoreLabel="Voir plus" showLessLabel="Voir moins"><Tall height={400} link /></ShowMore>
      </div>,
    );
    await expect.poll(() => root.querySelector("[data-ouro-show-more-toggle]")?.textContent).toBe("Voir plus");
    // Focus in the part that shows leaves it folded.
    await act(async () => root.querySelector<HTMLElement>('a[href="#top"]')!.focus());
    expect(fold(root).hasAttribute("data-folded")).toBe(true);
    await act(async () => root.querySelector<HTMLElement>('a[href="#bottom"]')!.focus());
    await expect.poll(() => root.querySelector("[data-ouro-show-more-toggle]")!.textContent).toBe("Voir moins");
    expect(fold(root).getBoundingClientRect().height).toBeGreaterThan(400);
    // Unfolded, focus moves freely.
    await act(async () => root.querySelector<HTMLElement>('a[href="#top"]')!.focus());
    expect(root.querySelector("[data-ouro-show-more-toggle]")!.textContent).toBe("Voir moins");
  });

  it("is folded in server HTML with all of its content and no button, and hydrates without a mismatch", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <ShowMore maxHeight={120}><Tall height={400} /></ShowMore>;
    const html = renderToString(node);
    expect(html).toContain("Top link");
    expect(html).toContain("max-h-(--ouro-show-more-height)");
    // Not measured yet: no fade, and no button.
    expect(html).not.toMatch(/\sdata-folded=/);
    expect(html).not.toContain("data-ouro-show-more-toggle");
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
    await expect.poll(() => host.querySelector("[data-ouro-show-more-toggle]")).not.toBeNull();
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("shows content exactly a fifth taller than maxHeight whole", async () => {
    const { root } = await render(<ShowMore maxHeight={120}><div style={{ height: 144 }} /></ShowMore>);
    await expect.poll(() => fold(root).getBoundingClientRect().height).toBeCloseTo(144, 0);
    expect(root.querySelector("[data-ouro-show-more-toggle]")).toBeNull();
  });

  it("measures again when maxHeight changes, and stops measuring once gone", async () => {
    const disconnect = vi.spyOn(ResizeObserver.prototype, "disconnect");
    const r = await render(<ShowMore maxHeight={120}><div style={{ height: 200 }} /></ShowMore>);
    await expect.poll(() => r.root.querySelector("[data-ouro-show-more-toggle]")).not.toBeNull();
    await r.rerender(<ShowMore maxHeight={300}><div style={{ height: 200 }} /></ShowMore>);
    await expect.poll(() => r.root.querySelector("[data-ouro-show-more-toggle]")).toBeNull();
    expect(fold(r.root).getBoundingClientRect().height).toBeCloseTo(200, 0);
    const before = disconnect.mock.calls.length;
    await r.rerender(null);
    expect(disconnect.mock.calls.length).toBe(before + 1);
  });

  it("keeps a focused element that ends right at the fold folded", async () => {
    const { root } = await render(
      <ShowMore maxHeight={120}>
        <a href="#edge" style={{ display: "block", height: 120 }}>
          Edge
        </a>
        <div style={{ height: 400 }} />
      </ShowMore>,
    );
    await expect.poll(() => root.querySelector("[data-ouro-show-more-toggle]")).not.toBeNull();
    await act(async () => root.querySelector<HTMLElement>('a[href="#edge"]')!.focus());
    expect(fold(root).hasAttribute("data-folded")).toBe(true);
  });

  it("brings the button back into view after Show less only when it is out of view", async () => {
    const { host } = await render(
      <div data-scroller="" style={{ height: 300, overflowY: "auto" }}>
        <ShowMore maxHeight={120}>
          <div style={{ height: 1000 }} />
        </ShowMore>
        <div style={{ height: 1000 }} />
      </div>,
    );
    const scroller = host.querySelector<HTMLElement>("[data-scroller]")!;
    await expect.poll(() => host.querySelector("[data-ouro-show-more-toggle]")).not.toBeNull();
    const button = host.querySelector<HTMLElement>("[data-ouro-show-more-toggle]")!;
    const frame = () => act(async () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // Folding back from far below: the button, now above the view, scrolls back in.
    await act(async () => button.click());
    await act(async () => void (scroller.scrollTop = 1100));
    await act(async () => button.click());
    await frame();
    const view = scroller.getBoundingClientRect();
    await expect.poll(() => button.getBoundingClientRect().top).toBeGreaterThanOrEqual(view.top - 1);
    expect(button.getBoundingClientRect().bottom).toBeLessThanOrEqual(view.bottom + 1);
    // Folding back with the button still in view leaves the scroll alone.
    await act(async () => button.click());
    await act(async () => void (scroller.scrollTop = 60));
    await act(async () => button.click());
    await frame();
    expect(scroller.scrollTop).toBe(60);
  });
});

describe("ShowMore open", () => {
  const clamped = (root: HTMLElement) => {
    const text = root.querySelector<HTMLElement>("[data-ouro-show-more-text]")!;
    return text.getBoundingClientRect().height <= parseFloat(getComputedStyle(text).lineHeight) * 2 + 1;
  };
  const folded = (root: HTMLElement) => root.querySelector("[data-ouro-show-more-fold]")!.getBoundingClientRect().height < 200;
  const toggle = (root: HTMLElement) => root.querySelector<HTMLElement>("[data-ouro-show-more-toggle]");

  it("follows open in each mode, and its buttons ask onOpenChange without changing it", async () => {
    const onOpenChange = vi.fn();
    const items = await render(<ShowMore items={linkRows} open onOpenChange={onOpenChange} />);
    expect(items.rows).toHaveLength(8);
    expect(items.button!.textContent).toBe("Show less");
    await userEvent.click(items.button!);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(items.rows).toHaveLength(8);
    await items.rerender(<ShowMore items={linkRows} open={false} onOpenChange={onOpenChange} />);
    expect(items.rows).toHaveLength(5);
    await userEvent.click(items.button!);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(items.rows).toHaveLength(5);
    // When the app agrees, focus still moves to the first new item.
    await items.rerender(<ShowMore items={linkRows} open onOpenChange={onOpenChange} />);
    expect(items.rows).toHaveLength(8);
    await expect.poll(() => document.activeElement?.textContent).toBe("Recipe 6");

    const lines = await render(<ShowMore lines={2} open onOpenChange={onOpenChange}>{longText}</ShowMore>);
    await expect.poll(() => toggle(lines.root)?.textContent).toBe("Show less");
    expect(clamped(lines.root)).toBe(false);
    await userEvent.click(toggle(lines.root)!);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(clamped(lines.root)).toBe(false);
    await lines.rerender(<ShowMore lines={2} open={false} onOpenChange={onOpenChange}>{longText}</ShowMore>);
    expect(clamped(lines.root)).toBe(true);
    expect(toggle(lines.root)!.textContent).toBe("Show more");
    await userEvent.click(toggle(lines.root)!);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(clamped(lines.root)).toBe(true);

    const tall = (
      <div>
        <div style={{ height: 400 }} />
        <a href="#bottom">Bottom link</a>
      </div>
    );
    const height = await render(<ShowMore maxHeight={120} open onOpenChange={onOpenChange}>{tall}</ShowMore>);
    await expect.poll(() => toggle(height.root)?.textContent).toBe("Show less");
    expect(folded(height.root)).toBe(false);
    await userEvent.click(toggle(height.root)!);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(folded(height.root)).toBe(false);
    await height.rerender(<ShowMore maxHeight={120} open={false} onOpenChange={onOpenChange}>{tall}</ShowMore>);
    expect(folded(height.root)).toBe(true);
    onOpenChange.mockClear();
    // Focus below the fold asks to unfold too.
    await act(async () => height.root.querySelector<HTMLElement>('a[href="#bottom"]')!.focus());
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(folded(height.root)).toBe(true);
  });

  it("tells onOpenChange each change of its own state when open is not set", async () => {
    const onOpenChange = vi.fn();
    const items = await render(<ShowMore items={recipes} onOpenChange={onOpenChange} />);
    await userEvent.click(items.button!);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(items.rows).toHaveLength(8);
    await userEvent.click(items.button!);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(items.rows).toHaveLength(5);

    const lines = await render(<ShowMore lines={2} onOpenChange={onOpenChange}>{longText}</ShowMore>);
    await expect.poll(() => toggle(lines.root)).not.toBeNull();
    await userEvent.click(toggle(lines.root)!);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(clamped(lines.root)).toBe(false);

    const height = await render(<ShowMore maxHeight={120} onOpenChange={onOpenChange}><div style={{ height: 400 }} /></ShowMore>);
    await expect.poll(() => toggle(height.root)).not.toBeNull();
    await userEvent.click(toggle(height.root)!);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(folded(height.root)).toBe(false);
    expect(onOpenChange).toHaveBeenCalledTimes(4);
  });

  it("drops the button when text shown whole no longer needs it", async () => {
    const lines = await render(<ShowMore lines={2} open onOpenChange={() => {}}>{longText}</ShowMore>);
    await expect.poll(() => toggle(lines.root)?.textContent).toBe("Show less");
    await lines.rerender(<ShowMore lines={2} open onOpenChange={() => {}}>Short note.</ShowMore>);
    await expect.poll(() => toggle(lines.root)).toBeNull();
  });
});

describe("ShowMore development messages", () => {
  it.each([
    ["maxLines", { lines: 2, children: longText, maxLines: 2 }, "maxLines is not a prop", "<ShowMore lines={2}>"],
    ["limit", { items: recipes, limit: 3 }, "limit is not a prop", "<ShowMore items={items} initialCount={3}>"],
    ["initialCount", { items: recipes, initialCount: 0 }, "initialCount={0} is not a whole number above 0", "<ShowMore items={items} initialCount={5}>"],
    ["lines", { lines: -1, children: longText }, "lines={-1} is not a whole number above 0", "<ShowMore lines={3}>"],
    ["maxHeight", { maxHeight: 0, children: longText }, "maxHeight={0} is not a number of pixels above 0", "<ShowMore maxHeight={240}>"],
    ["open", { items: recipes, open: true }, "open without onOpenChange: its button can't change it", "<ShowMore open={open} onOpenChange={setOpen}>"],
  ])("warns for %s with the fix", async (_name, extra, problem, fix) => {
    const props = extra as unknown as ShowMoreProps;
    const { root } = await render(<ShowMore {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] ShowMore: ${problem}. Fix: ${fix}.`);
    expect(root.hasAttribute("limit")).toBe(false);
  });

  it("clamps to a guessed maxLines when lines is missing", async () => {
    const { root } = await render(<ShowMore {...({ maxLines: 2, children: longText } as unknown as ShowMoreProps)} />);
    const text = root.querySelector<HTMLElement>("[data-ouro-show-more-text]")!;
    expect(text.getBoundingClientRect().height).toBeCloseTo(parseFloat(getComputedStyle(text).lineHeight) * 2, 0);
    expect(warn).toHaveBeenCalledWith("[ouro-ui] ShowMore: maxLines is not a prop. Fix: <ShowMore lines={2}>.");
  });

  it("uses the default for an invalid initialCount or lines", async () => {
    const items = await render(<ShowMore {...({ items: recipes, initialCount: 0 } as unknown as ShowMoreProps)} />);
    expect(items.rows).toHaveLength(5);
    const lines = await render(<ShowMore {...({ lines: 0, children: longText } as unknown as ShowMoreProps)} />);
    const text = lines.root.querySelector<HTMLElement>("[data-ouro-show-more-text]")!;
    expect(text.getBoundingClientRect().height).toBeCloseTo(parseFloat(getComputedStyle(text).lineHeight) * 3, 0);
  });

  it("warns of nothing when the props are right, in every mode", async () => {
    await render(<ShowMore items={recipes} initialCount={3} />);
    await render(<ShowMore lines={2}>{longText}</ShowMore>);
    await render(<ShowMore maxHeight={120}>{longText}</ShowMore>);
    await render(<ShowMore items={recipes} hasMore={false} onShowMore={() => {}} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("renders a list when items comes with maxHeight", async () => {
    const { rows, root } = await render(<ShowMore {...({ items: recipes, maxHeight: 100 } as unknown as ShowMoreProps)} />);
    expect(rows).toHaveLength(5);
    expect(root.querySelector("[data-ouro-show-more-fold]")).toBeNull();
  });

  it("folds to the default height for an invalid maxHeight", async () => {
    const { root } = await render(<ShowMore {...({ maxHeight: Number.NaN, children: <div style={{ height: 600 }} /> } as unknown as ShowMoreProps)} />);
    await expect.poll(() => root.querySelector("[data-ouro-show-more-toggle]")).not.toBeNull();
    expect(root.querySelector<HTMLElement>("[data-ouro-show-more-fold]")!.getBoundingClientRect().height).toBeCloseTo(240, 0);
  });

  it("checks the className", async () => {
    await render(<ShowMore items={recipes} className="text-sm" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] ShowMore: "text-sm" sets appearance, and className is for layout only. Fix: <div className="text-sm"><ShowMore /></div>.',
    );
  });

  it("points other appearance classes to ShowMore's own look", async () => {
    await render(<ShowMore items={recipes} className="bg-muted" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] ShowMore: "bg-muted" sets appearance, and className is for layout only. Fix: remove "bg-muted"; ShowMore sets its own look.',
    );
  });

  it("renders to a string without warnings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(<ShowMore items={recipes} className="bg-red-500" />);
    expect(html).toContain('data-ouro="show-more"');
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
