export { watchAnnouncements };
export type { Announcement, AnnouncementWatch };

// The export list comes first because the shadcn CLI drops comments before a file's
// first statement, which would take the JSDoc below with it.

/** Text a live region exposed, and the region it appeared in. */
interface Announcement {
  /** The live region: `role="status"`, `role="alert"`, `role="log"` or an `aria-live` element. */
  region: Element;
  /** The text that appeared in it. */
  text: string;
}

/** What `watchAnnouncements` has seen so far. */
interface AnnouncementWatch {
  /** Every announcement since the watch started, in order. */
  changes: Announcement[];
  /** The announcements whose text includes `text`. */
  matching(text: string): Announcement[];
  /** How many announcements include `text`: 1 means a screen reader heard it once. */
  count(text: string): number;
  /** Stops watching; `changes` keeps what was seen. */
  stop(): void;
}

const liveSelector = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]';

/** Whether a node is exposed to assistive tech: not inside `aria-hidden="true"`. */
function exposed(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return !element?.closest('[aria-hidden="true"]');
}

/**
 * Records what live regions announce from now on: text added to a live region (polite or
 * assertive), text changed in place inside one, and a live region added with its text. Text
 * inside `aria-hidden="true"` and text outside any live region are left out, and so is a render
 * that leaves the text as it was, so `count` says how many times a screen reader would hear a
 * message. Watches `document.body`, portals included; call `stop()` when the test ends.
 *
 * Use it to prove an announcement happens once per change (a toast, a saved state, a checklist
 * row). Use `getByRole("status")` instead when you only need the region's current text.
 *
 * @example
 * const announcements = watchAnnouncements();
 * await userEvent.click(page.getByRole("button", { name: "Save" }));
 * await expect.poll(() => announcements.count("Saved")).toBe(1);
 * expect(announcements.matching("Saved")[0]!.region.getAttribute("role")).toBe("status");
 * announcements.stop();
 */
function watchAnnouncements(): AnnouncementWatch {
  const changes: Announcement[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      const nodes = record.type === "characterData" ? [record.target] : [...record.addedNodes];
      for (const node of nodes) {
        // Text added inside a live region, or a live region added with its text.
        const region =
          target?.closest(liveSelector) ?? (node instanceof Element ? (node.matches(liveSelector) ? node : node.querySelector(liveSelector)) : null);
        const text = exposed(node) ? (node.textContent ?? "") : "";
        if (region && text) changes.push({ region, text });
      }
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  const matching = (text: string) => changes.filter((change) => change.text.includes(text));
  return { changes, matching, count: (text: string) => matching(text).length, stop: () => observer.disconnect() };
}
