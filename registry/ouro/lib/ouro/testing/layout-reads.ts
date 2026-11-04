import { onTestFinished } from "vitest";

export { layoutReadNames, watchLayoutReads };
export type { LayoutRead, LayoutReads };

/**
 * The reads `watchLayoutReads` counts: each makes the browser bring style and layout up to date
 * first when anything changed since it last did, so inside a React commit, where the page has just
 * changed, each one lays the page out before it paints (a forced layout). `getComputedStyle`
 * counts as soon as it is called, since nearly any property read from it does that.
 *
 * @claim "each makes the browser bring style and layout up to date" registry/ouro/lib/ouro/testing/layout-reads.test.ts verify:testExists(registry/ouro/lib/ouro/testing/layout-reads.test.ts::watchLayoutReads > reads a size changed a moment ago at once, which the browser can answer only by laying the page out first)
 */
const layoutReadNames = [
  "offsetHeight",
  "offsetWidth",
  "offsetTop",
  "offsetLeft",
  "offsetParent",
  "clientHeight",
  "clientWidth",
  "clientTop",
  "clientLeft",
  "scrollHeight",
  "scrollWidth",
  "scrollTop",
  "scrollLeft",
  "getBoundingClientRect",
  "getClientRects",
  "getComputedStyle",
] as const;

/** One layout read: what was read, and the element, range or window it was read from. */
interface LayoutRead {
  name: (typeof layoutReadNames)[number];
  target: unknown;
}

/** What `watchLayoutReads` has seen. */
interface LayoutReads {
  /**
   * Every read since the watch started, in order.
   * @claim "Every read since the watch started, in order" registry/ouro/lib/ouro/testing/layout-reads.test.ts verify:testExists(registry/ouro/lib/ouro/testing/layout-reads.test.ts::watchLayoutReads > records each read that lays the page out, with what it was read from, in order)
   */
  readonly reads: readonly LayoutRead[];
  /** The names of those reads, in order: `[]` when nothing was read. */
  names(): string[];
  /** Puts the browser's own getters and methods back. Calling it again does nothing. */
  stop(): void;
}

// Where each read lives: offset* on HTMLElement, client* and scroll* on Element, the rectangles on Element and Range.
const getters: ReadonlyArray<[object, readonly LayoutRead["name"][]]> = [
  [HTMLElement.prototype, ["offsetHeight", "offsetWidth", "offsetTop", "offsetLeft", "offsetParent"]],
  [Element.prototype, ["clientHeight", "clientWidth", "clientTop", "clientLeft", "scrollHeight", "scrollWidth", "scrollTop", "scrollLeft"]],
];
const methods: ReadonlyArray<[object, readonly LayoutRead["name"][]]> = [
  [Element.prototype, ["getBoundingClientRect", "getClientRects"]],
  [Range.prototype, ["getBoundingClientRect", "getClientRects"]],
  [window, ["getComputedStyle"]],
];

/**
 * Records every read that lays the page out, from now until `stop()` or the end of the test, so a
 * test proves that a render costs no forced layout: a re-render that changes nothing a component
 * measures should read nothing.
 *
 * Start it right before the change and stop it right after, around a render in `act`: it counts
 * every read on the page while it runs, including your own and those a resize observer's callback
 * makes, where the layout is already done. Reads stubbed by `vi.spyOn` while it runs still count.
 *
 * @example
 * const reads = watchLayoutReads();
 * await act(() => root.render(<NavigationRail label="Main" items={withNewCount} />));
 * reads.stop();
 * expect(reads.names()).toEqual([]);
 * @claim "Records every read that lays the page out" registry/ouro/lib/ouro/testing/layout-reads.test.ts verify:testExists(registry/ouro/lib/ouro/testing/layout-reads.test.ts::watchLayoutReads > records each read that lays the page out, with what it was read from, in order)
 * @claim "from now until `stop()` or the end of the test" registry/ouro/lib/ouro/testing/layout-reads.test.ts verify:testExists(registry/ouro/lib/ouro/testing/layout-reads.test.ts::watchLayoutReads > puts the browser's own reads back on stop, and at the end of the test)
 */
function watchLayoutReads(): LayoutReads {
  const reads: LayoutRead[] = [];
  const restores: Array<() => void> = [];
  for (const [owner, names] of getters) {
    for (const name of names) {
      const own = Object.getOwnPropertyDescriptor(owner, name)!;
      Object.defineProperty(owner, name, {
        ...own,
        get(this: object) {
          reads.push({ name, target: this });
          return own.get!.call(this);
        },
      });
      restores.push(() => Object.defineProperty(owner, name, own));
    }
  }
  for (const [owner, names] of methods) {
    for (const name of names) {
      const own = Object.getOwnPropertyDescriptor(owner, name)!;
      const original = own.value as (...args: unknown[]) => unknown;
      Object.defineProperty(owner, name, {
        ...own,
        value: function (this: unknown, ...args: unknown[]) {
          reads.push({ name, target: owner === window ? args[0] : this });
          return original.apply(this, args);
        },
      });
      restores.push(() => Object.defineProperty(owner, name, own));
    }
  }
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const restore of restores.reverse()) restore();
  };
  // Started outside a test (in a `beforeAll`), there is no test to wait for.
  try {
    onTestFinished(stop);
  } catch {
    // Not in a test: the caller stops it.
  }
  return { reads, names: () => reads.map((read) => read.name), stop };
}
