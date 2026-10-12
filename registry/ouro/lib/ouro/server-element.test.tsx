import type { ReactElement } from "react";
import { expect, it } from "vitest";
import { serverElement } from "@/registry/ouro/lib/ouro/server-element";

/** What React's Flight client hands over for an element prop: a lazy wrapper around `value`. */
const lazy = (value: unknown) => ({ $$typeof: Symbol.for("react.lazy"), _payload: value, _init: (payload: unknown) => payload }) as unknown as ReactElement;

it("resolves a lazy wrapper to the element inside it", () => {
  const resolved = serverElement(lazy(<button>Edit</button>));
  expect(resolved.type).toBe("button");
  expect((resolved.props as { children: string }).children).toBe("Edit");
});

it("returns a plain element, or nothing, unchanged", () => {
  const element = <button>Edit</button>;
  expect(serverElement(element)).toBe(element);
  expect(serverElement(undefined)).toBeUndefined();
});

it("keeps a lazy wrapper that holds no element, so cloning it still fails loudly", () => {
  const wrapper = lazy("text");
  expect(serverElement(wrapper)).toBe(wrapper);
});
