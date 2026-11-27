import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { OuroProvider, type OuroLinkComponent } from "@/registry/ouro/lib/ouro/ouro-provider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

let root: Root | undefined;
let host: HTMLDivElement | undefined;

async function render(node: ReactNode) {
  host = document.createElement("div");
  host.style.width = "600px";
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});

describe("Message quote link", () => {
  it("uses onOpen for linked and button quotes, ahead of the legacy onActivate callback", async () => {
    const onOpen = vi.fn();
    const onActivate = vi.fn();
    await render(
      <>
        <Message role="assistant" name="Robin Vale" quote={{ author: "Fern Moss", excerpt: "Linked note", href: "#original-note", onOpen, onActivate }} />
        <Message role="assistant" name="Robin Vale" quote={{ author: "Fern Moss", excerpt: "Button note", onOpen }} />
      </>,
    );
    await userEvent.click(page.getByRole("link", { name: "Reply to Fern Moss: Linked note" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(location.hash).not.toBe("#original-note");
    await userEvent.click(page.getByRole("button", { name: "Reply to Fern Moss: Button note" }));
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("opens the whole quote in place on click and Enter, with its author, custom day and control markers", async () => {
    const onActivate = vi.fn();
    const host = await render(
      <Message role="user" name="Robin Vale" quote={{ author: "Fern Moss", excerpt: "The lanterns arrive at noon.", at: "2026-11-27T09:30:00Z", atText: "Today", href: "#quoted-lanterns", onOpen: onActivate }}>
        I will clear a shelf.
      </Message>,
    );
    const link = page.getByRole("link", { name: "Reply to Fern Moss, Today: The lanterns arrive at noon.", exact: true }).element() as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("#quoted-lanterns");
    expect(link.dataset.ouroControl).toBe("message");
    expect(link.dataset.ouroPart).toBe("quote-link");
    expect(link.hasAttribute("data-ouro-message-quote")).toBe(true);
    const time = link.querySelector("[data-ouro-message-quote-day] time")!;
    expect(time.textContent).toBe("Today");
    expect(time.getAttribute("datetime")).toBe("2026-11-27T09:30:00.000Z");
    expect(getComputedStyle(link).textDecorationLine).toBe("none");
    expect(getComputedStyle(link).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(link.querySelector("[data-ouro-message-quote-bar]")).not.toBeNull();
    expect(getComputedStyle(link.querySelector("[data-ouro-message-quote-author]")!).color).toBe(getComputedStyle(host.querySelector("[data-ouro-message-content]")!).color);
    await userEvent.click(link);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(location.hash).not.toBe("#quoted-lanterns");
    link.focus();
    await userEvent.keyboard("{Enter}");
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(link);
    expect(location.hash).not.toBe("#quoted-lanterns");
    expect(getComputedStyle(link).outlineWidth).toBe("2px");
    expect(getComputedStyle(link).outlineColor).toBe(getComputedStyle(host.querySelector("[data-ouro-message-content]")!).color);
  });

  it("leaves modifier and middle clicks to the browser and intercepts only an ordinary click", async () => {
    const onActivate = vi.fn();
    await render(<Message role="assistant" name="Robin Vale" quote={{ author: "Fern Moss", excerpt: "The lanterns arrive at noon.", href: "#quote-navigation", onOpen: onActivate }} />);
    const link = page.getByRole("link").element();
    const prevented: boolean[] = [];
    const watch = (event: Event) => {
      prevented.push(event.defaultPrevented);
      event.preventDefault();
    };
    window.addEventListener("click", watch);
    window.addEventListener("auxclick", watch);
    try {
      for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, {}]) {
        await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init })));
      }
      await act(async () => link.dispatchEvent(new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true })));
    } finally {
      window.removeEventListener("click", watch);
      window.removeEventListener("auxclick", watch);
    }
    expect(prevented).toEqual([false, false, false, false, false, true, false]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0]).toEqual([]);
    const prevent = (event: Event) => event.preventDefault();
    window.addEventListener("click", prevent, true);
    try {
      await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    } finally {
      window.removeEventListener("click", prevent, true);
    }
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("keeps a linked thread context outside the linked quote and preserves a custom accessible label", async () => {
    const onActivate = vi.fn();
    const onThread = vi.fn();
    const host = await render(
      <Message variant="chat" role="assistant" name="Robin Vale" quote={{
        author: "Fern Moss",
        excerpt: "The lanterns arrive at noon.",
        href: "#quote-context",
        onActivate,
        label: "Quoted delivery note",
        context: <>Replied in thread: <Link href="#lantern-delivery" inline tone="secondary" onClick={(event) => { event.preventDefault(); onThread(); }}>Lantern delivery</Link></>,
      }} />,
    );
    const quote = page.getByRole("link", { name: "Quoted delivery note: The lanterns arrive at noon.", exact: true }).element();
    const context = host.querySelector("[data-ouro-message-quote-context]")!;
    expect(quote.contains(context)).toBe(false);
    expect(context.contains(quote)).toBe(false);
    expect(context.compareDocumentPosition(quote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(quote.querySelector("a, button")).toBeNull();
    await userEvent.click(page.getByRole("link", { name: "Lantern delivery", exact: true }));
    expect(onThread).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("leaves navigation unprevented when href has no callback", async () => {
    await render(<Message role="assistant" name="Robin Vale" quote={{ author: "Fern Moss", excerpt: "The lanterns arrive at noon.", href: "#quote-native" }} />);
    const link = page.getByRole("link").element();
    let prevented: boolean | undefined;
    const watch = (event: Event) => {
      prevented = event.defaultPrevented;
      event.preventDefault();
    };
    window.addEventListener("click", watch);
    try {
      await act(async () => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    } finally {
      window.removeEventListener("click", watch);
    }
    expect(prevented).toBe(false);
  });

  it("keeps the thread context link's underline inside its clipped line", async () => {
    const host = await render(
      <Message variant="chat" role="user" name="Robin Vale" quote={{
        author: "Fern Moss",
        excerpt: "The lanterns arrive at noon.",
        href: "#quote-underline",
        context: <>Replied in thread: <Link href="#delivery" inline>Lantern delivery</Link></>,
      }} />,
    );
    const context = host.querySelector<HTMLElement>("[data-ouro-message-quote-context]")!;
    const link = context.querySelector("a")!;
    const css = getComputedStyle(link);
    const canvas = document.createElement("canvas").getContext("2d")!;
    canvas.font = css.font;
    const descent = canvas.measureText(link.textContent!).fontBoundingBoxDescent;
    const underlineBottom = link.getBoundingClientRect().bottom - descent + parseFloat(css.textUnderlineOffset) + parseFloat(css.textDecorationThickness);
    expect(css.textDecorationLine).toBe("underline");
    expect(underlineBottom).toBeLessThanOrEqual(context.getBoundingClientRect().bottom);
  });

  it("uses the provider's router for an internal quote destination without restyling the quote", async () => {
    const Router: OuroLinkComponent = (props) => <a data-quote-router="" {...props} />;
    await render(
      <OuroProvider linkComponent={Router}>
        <Message role="assistant" name="Robin Vale" quote={{ author: "Fern Moss", excerpt: "The lanterns arrive at noon.", href: "/messages/lanterns" }} />
      </OuroProvider>,
    );
    const link = page.getByRole("link").element();
    expect(link.hasAttribute("data-quote-router")).toBe(true);
    expect(link.getAttribute("href")).toBe("/messages/lanterns");
    expect(link.getAttribute("data-ouro-part")).toBe("quote-link");
    expect(getComputedStyle(link).textDecorationLine).toBe("none");
  });

  it("retains a callback-only button and a quiet noninteractive quote without href", async () => {
    const onActivate = vi.fn();
    const host = await render(
      <>
        <Message role="assistant" name="Robin Vale" quote={{ author: "Fern Moss", excerpt: "The lanterns arrive at noon.", onActivate }} />
        <Message role="assistant" name="Robin Vale" quote={{ author: "Fern Moss", excerpt: "Save the blue ribbon." }} />
      </>,
    );
    const button = page.getByRole("button", { name: "Reply to Fern Moss: The lanterns arrive at noon." });
    expect(button.element().getAttribute("data-ouro-part")).toBe("quote");
    await userEvent.click(button);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(host.querySelector("blockquote")!.textContent).toContain("Save the blue ribbon.");
    expect(host.querySelector("a")).toBeNull();
  });
});
