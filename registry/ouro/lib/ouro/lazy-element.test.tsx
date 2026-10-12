import { Suspense, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { unwrapLazyElement } from "@/registry/ouro/lib/ouro/lazy-element";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

/** What React's server-component client hands over in place of an element that is still loading. */
function lazyWrapper(init: () => unknown): ReactElement {
  return { $$typeof: Symbol.for("react.lazy"), _payload: null, _init: init } as unknown as ReactElement;
}

it("unwrapLazyElement returns an element, and no element, as they are", () => {
  const element = <button type="button">Edit</button>;
  expect(unwrapLazyElement(element)).toBe(element);
  expect(unwrapLazyElement(undefined)).toBeUndefined();
});

it("unwrapLazyElement returns the element behind a lazy wrapper, with its props", () => {
  const unwrapped = unwrapLazyElement(lazyWrapper(() => <button type="button">Edit</button>) as ReactElement<{ children: string }>)!;
  expect(unwrapped.type).toBe("button");
  expect(unwrapped.props.children).toBe("Edit");
});

it("unwrapLazyElement leaves a wrapper around something that is not an element", () => {
  const wrapper = lazyWrapper(() => "Edit");
  expect(unwrapLazyElement(wrapper)).toBe(wrapper);
});

it("unwrapLazyElement suspends until a wrapped element has loaded", async () => {
  let loaded: ReactElement | undefined;
  let finish!: () => void;
  const loading = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const wrapper = lazyWrapper(() => {
    // As React's own lazy does: throw what is still loading.
    if (!loaded) throw loading;
    return loaded;
  });
  function Reads() {
    return <output>{(unwrapLazyElement(wrapper) as ReactElement<{ title: string }>).props.title}</output>;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <Suspense fallback="Loading">
          <Reads />
        </Suspense>,
      ),
    );
    expect(host.textContent).toBe("Loading");
    await act(async () => {
      loaded = <span title="Loaded" />;
      finish();
      await loading;
    });
    expect(host.textContent).toBe("Loaded");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
