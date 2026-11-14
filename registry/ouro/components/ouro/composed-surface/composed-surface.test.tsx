import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ComposedSurface, type ComposedSurfaceProps } from "@/registry/ouro/components/ouro/composed-surface/composed-surface";
import { actionButtonProps, loadCatalog, validateTree, type ComposedNode, type Obj, type PersonPress } from "@/registry/ouro/lib/ouro/a2ui-core";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in Chromium and WebKit. The tree is built in code, with no A2UI in between: a recipe app's catalog, cut down to
// what these tests use, gives each button its label, consent and confirm sheet through core's actionButtonProps.

const field = (label: string, kind = "string", optional = false) => ({ label, kind, optional });
const catalog = loadCatalog({
  catalogId: "https://example.com/a2ui/catalog.json",
  components: Object.fromEntries(["Card", "Stack", "Heading", "Text", "Image", "Badge", "List", "DescriptionList", "Separator", "Alert", "ActionButton"].map((n) => [n, {}])),
  metadata: {
    extensions: {
      bot_ouroboros_hx: {
        actions: {
          add_recipe_to_shopping_list: { consent: "write", press: "run", label: "Add ingredients to list", description: "Add this recipe's ingredients to your shopping list.", input: { recipe: field("Recipe"), servings: field("Servings", "integer", true) } },
          share_recipe: { consent: "consequential", press: "confirm", label: "Share recipe", description: "Send this recipe to someone.", input: { recipe: field("Recipe"), with: field("With") } },
          order_ingredients: { consent: "person-only", press: "handoff", label: "Order ingredients", description: "Order this recipe's ingredients for delivery.", input: { recipe: field("Recipe") }, personOnly: { how: "with Order ingredients on the recipe in the app", refusal: {} } },
        },
      },
    },
  },
});

const node = (id: string, component: string, props: Obj = {}, children: ComposedNode[] = []): ComposedNode => ({ id, component, props, children });
const named = (value: string) => (value === "rcp_1" ? "Charred Lemon Orzo" : undefined);

const tree = node("root", "Card", {}, [
  node("photo", "Image", { url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", description: "A pan of orzo", aspect: "wide" }),
  node("name", "Heading", { text: "Charred Lemon Orzo", level: 1 }),
  node("about", "Text", { text: "A weeknight pan dinner.", tone: "muted" }),
  node("tags", "Stack", { direction: "horizontal", gap: "small" }, [node("tag", "Badge", { text: "Vegetarian", tone: "neutral" }), node("tag", "Badge", { text: "One pan", tone: "info" })]),
  node("facts", "DescriptionList", { items: [{ term: "Time", detail: "25 min" }] }),
  node("line", "Separator"),
  node("steps", "List", { items: ["Toast", "Simmer"], ordered: true }),
  node("note", "Alert", { title: "Contains dairy", tone: "warning" }),
  node("buttons", "Stack", { direction: "vertical", gap: "none" }, [
    node("shop", "ActionButton", { ...actionButtonProps(catalog, "add_recipe_to_shopping_list", { recipe: "rcp_1", servings: 4 }), emphasis: "primary" }),
    node("share", "ActionButton", { ...actionButtonProps(catalog, "share_recipe", { recipe: "rcp_1", with: "sam@example.com" }, { label: ({ value }) => named(value) }), emphasis: "secondary" }),
    node("order", "ActionButton", { ...actionButtonProps(catalog, "order_ingredients", {}), emphasis: "secondary" }),
  ]),
]);

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(element: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(element));
  return host;
}

function props(overrides: Partial<ComposedSurfaceProps> = {}): ComposedSurfaceProps {
  return { tree, onPress: vi.fn(), onHandoff: vi.fn(), ...overrides };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  await page.viewport(1280, 800);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((r) => r.unmount()));
  mounted.forEach((m) => m.remove());
  mounted = [];
  warn.mockRestore();
});

describe("ComposedSurface", () => {
  it("draws a tree built in code, which core's validator accepts, with HX components", async () => {
    expect(validateTree(catalog, tree)).toEqual([]);
    const host = await render(<ComposedSurface {...props()} className="max-w-md" />);
    const root = host.querySelector('[data-ouro="composed-surface"]')!;
    expect(root.className).toContain("max-w-md");
    expect(root.className).toContain("min-w-0");
    expect(root.firstElementChild!.getAttribute("data-ouro")).toBe("card");
    expect(root.querySelector('[data-ouro="card"] img')!.getAttribute("alt")).toBe("A pan of orzo");
    expect(page.getByRole("heading", { level: 1, name: "Charred Lemon Orzo" }).element()).toBeTruthy();
    expect([...root.querySelectorAll('[data-ouro="badge"]')].map((b) => b.textContent)).toEqual(["Vegetarian", "One pan"]);
    expect([...root.querySelectorAll("dd")].map((d) => d.textContent)).toEqual(["25 min"]);
    expect([...root.querySelectorAll("ol li")].map((li) => li.textContent)).toEqual(["Toast", "Simmer"]);
    expect(root.querySelectorAll('[data-ouro="separator"]')).toHaveLength(1);
    expect(root.querySelector('[data-ouro="alert"]')!.textContent).toContain("Contains dairy");
    expect([...root.querySelectorAll("button[data-action]")].map((b) => b.textContent)).toEqual(["Add ingredients to list", "Share recipe", "Order ingredients"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("presses a write button with the prepared input, pressed by the person", async () => {
    let finish!: () => void;
    const onPress = vi.fn<(press: PersonPress, button: ComposedNode) => Promise<void>>(() => new Promise<void>((resolve) => (finish = resolve)));
    const host = await render(<ComposedSurface {...props({ onPress })} />);
    const shop = host.querySelector<HTMLButtonElement>('button[data-action="add_recipe_to_shopping_list"]')!;
    await userEvent.click(shop);
    expect(onPress).toHaveBeenCalledTimes(1);
    const [press, button] = onPress.mock.calls[0]!;
    expect(press).toEqual({ action: "add_recipe_to_shopping_list", input: { recipe: "rcp_1", servings: 4 }, consent: "write", label: "Add ingredients to list", by: "person" });
    expect(button.id).toBe("shop");
    await expect.poll(() => shop.getAttribute("aria-busy")).toBe("true");
    await act(async () => finish());
    await expect.poll(() => shop.getAttribute("aria-busy")).not.toBe("true");
  });

  it("presses a button whose handler returns nothing without waiting", async () => {
    const onPress = vi.fn();
    const host = await render(<ComposedSurface {...props({ onPress })} />);
    const shop = host.querySelector<HTMLButtonElement>('button[data-action="add_recipe_to_shopping_list"]')!;
    const busy: (string | null)[] = [];
    const watch = new MutationObserver(() => busy.push(shop.getAttribute("aria-busy")));
    watch.observe(shop, { attributes: true, attributeFilter: ["aria-busy"] });
    await userEvent.click(shop);
    await act(async () => {});
    watch.disconnect();
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(busy).not.toContain("true");
  });

  it("asks the person to confirm a consequential action with what the agent prepared, and presses it only on confirm", async () => {
    const onPress = vi.fn();
    const host = await render(<ComposedSurface {...props({ onPress })} />);
    await userEvent.click(host.querySelector<HTMLButtonElement>('button[data-action="share_recipe"]')!);
    const dialog = page.getByRole("alertdialog", { name: "Share recipe?" });
    await expect.element(dialog).toBeVisible();
    expect(dialog.element().textContent).toContain("Send this recipe to someone.");
    expect([...dialog.element().querySelectorAll("p span.block")].map((l) => l.textContent)).toEqual(["Recipe: Charred Lemon Orzo rcp_1", "With: sam@example.com"]);
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(onPress).not.toHaveBeenCalled();
    await userEvent.click(host.querySelector<HTMLButtonElement>('button[data-action="share_recipe"]')!);
    await userEvent.click(page.getByRole("alertdialog").getByRole("button", { name: "Share recipe" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress.mock.calls[0]![0]).toEqual({ action: "share_recipe", input: { recipe: "rcp_1", with: "sam@example.com" }, consent: "consequential", label: "Share recipe", by: "person", confirmed: true });
  });

  it("hands a person-only action to the app's own screen and never presses it", async () => {
    const onPress = vi.fn();
    const onHandoff = vi.fn();
    const host = await render(<ComposedSurface {...props({ onPress, onHandoff })} />);
    const order = host.querySelector<HTMLButtonElement>('button[data-action="order_ingredients"]')!;
    expect(order.querySelector("svg[aria-hidden]")).not.toBeNull();
    await userEvent.click(order);
    expect(onHandoff).toHaveBeenCalledWith({ action: "order_ingredients", how: "with Order ingredients on the recipe in the app" });
    expect(onPress).not.toHaveBeenCalled();
  });

  it("draws the new tree when it changes", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(<ComposedSurface {...props({ tree: node("root", "Text", { text: "First" }) })} />));
    expect(host.textContent).toBe("First");
    await act(async () => root.render(<ComposedSurface {...props({ tree: node("root", "Text", { text: "Second" }) })} />));
    expect(host.textContent).toBe("Second");
  });

  it("warns when a guessed onAction takes the place of onPress", async () => {
    await render(<ComposedSurface {...props()} {...({ onAction: () => {} } as object)} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ComposedSurface: onAction is not a prop; a pressed button calls onPress, or onHandoff for a person-only one. Fix: <ComposedSurface onPress={run} onHandoff={openApp} />."));
  });
});
