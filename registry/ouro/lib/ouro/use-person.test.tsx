import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { createPeopleCache, unknownPerson, type PeopleCache, type PersonEntry, type PersonRead } from "@/registry/ouro/lib/ouro/people-cache";
import { usePerson } from "@/registry/ouro/lib/ouro/use-person";

const MINUTE = 60_000;
const START = Date.UTC(2026, 0, 1, 12);

const roots: Root[] = [];
let mounted: Element[] = [];

function Author({ cache, id, seen }: { cache: PeopleCache<string>; id: string | null | undefined; seen?: PersonEntry<string>[] }) {
  const person = usePerson(cache, id);
  seen?.push(person);
  return <span>{person.status === "found" ? person.value : "Someone"}</span>;
}

function host(html = "") {
  const element = document.createElement("div");
  element.innerHTML = html;
  document.body.append(element);
  mounted.push(element);
  return element;
}

const advance = (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms), await vi.advanceTimersByTimeAsync(0)));

function names() {
  let round = 0;
  const read = vi.fn(async (ids: string[]) => {
    round += 1;
    return Object.fromEntries(ids.map((id): [string, PersonRead<string>] => [id, { value: `${id} ${round}` }]));
  });
  return { read, cache: createPeopleCache({ read, foundFor: 10 * MINUTE }) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: START });
});
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("usePerson", () => {
  it("shows a person from the cache, read while the component shows them and again when their entry runs out", async () => {
    const { read, cache } = names();
    const element = host();
    const root = createRoot(element);
    roots.push(root);
    await act(async () => root.render(<Author cache={cache} id="Ana" />));
    expect(element.textContent).toBe("Someone");
    await advance();
    expect(element.textContent).toBe("Ana 1");
    await advance(10 * MINUTE);
    expect(element.textContent).toBe("Ana 2");
    await act(async () => root.render(<Author cache={cache} id="Bo" />));
    await advance();
    expect(element.textContent).toBe("Bo 3");
    // Ana is no longer shown, so her entry running out reads nothing.
    await act(async () => root.unmount());
    roots.pop();
    await advance(20 * MINUTE);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("gives the unknown entry and reads nothing while the id is not known", async () => {
    const { read, cache } = names();
    const seen: PersonEntry<string>[] = [];
    const root = createRoot(host());
    roots.push(root);
    for (const id of [null, undefined]) {
      await act(async () => root.render(<Author cache={cache} id={id} seen={seen} />));
      await advance();
    }
    expect(read).not.toHaveBeenCalled();
    expect(seen.every((entry) => entry === unknownPerson)).toBe(true);
  });

  it("renders the unknown entry on the server, and hydrates without a mismatch before showing the person", async () => {
    const { read, cache } = names();
    cache.set("Ana", "Ana Lind");
    const html = renderToString(<Author cache={cache} id="Ana" />);
    expect(html).toBe("<span>Someone</span>");
    const element = host(html);
    const errors = vi.spyOn(console, "error");
    await act(async () => void roots.push(hydrateRoot(element, <Author cache={cache} id="Ana" />)));
    await advance();
    expect(element.textContent).toBe("Ana Lind");
    expect(errors).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
});
