import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ComposedSurface, type ComposedSurfaceProps } from "@/registry/ouro/components/ouro/composed-surface/composed-surface";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Row } from "@/registry/ouro/components/ouro/stack/row";
import { Stack } from "@/registry/ouro/components/ouro/stack/stack";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { actionButtonProps, loadCatalog, validateTree, type ComposedNode, type Obj, type PersonPress } from "@/registry/ouro/lib/ouro/a2ui-core";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in Chromium and WebKit. The tree is built in code, with no A2UI in between: a recipe app's catalog, cut down to
// what these tests use, gives each button its label, consent and confirm sheet through core's actionButtonProps.

const field = (label: string, kind = "string", optional = false) => ({ label, kind, optional });
const catalog = loadCatalog({
  catalogId: "https://example.com/a2ui/catalog.json",
  components: Object.fromEntries(["Card", "Stack", "Heading", "Text", "Image", "Badge", "List", "DescriptionList", "Separator", "Alert", "TextField", "Checkbox", "Select", "ActionButton"].map((n) => [n, {}])),
  metadata: {
    extensions: {
      bot_ouroboros_hx: {
        actions: {
          add_recipe_to_shopping_list: { consent: "write", press: "run", label: "Add ingredients to list", description: "Add this recipe's ingredients to your shopping list.", input: { recipe: field("Recipe"), servings: field("Servings", "integer", true) } },
          share_recipe: { consent: "consequential", press: "confirm", label: "Share recipe", description: "Send this recipe to someone.", input: { recipe: field("Recipe"), with: field("With") } },
          plan_dinner: {
            consent: "write",
            press: "run",
            label: "Plan dinner",
            description: "Put this recipe on the week's plan.",
            input: { recipe: field("Recipe"), servings: field("Servings", "integer", true), vegetarian: field("Vegetarian", "boolean", true), oven: field("Oven", "string", true), note: field("Note", "string", true), title: field("Title", "string", true) },
          },
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

  it("draws a Stack as a column or a wrapping row, Text muted or plain, an Image on its own, and a List with or without numbers", async () => {
    const host = await render(
      <ComposedSurface
        {...props({
          tree: node("root", "Stack", { direction: "vertical", gap: "small" }, [
            node("row", "Stack", { direction: "horizontal", gap: "small" }, [node("a", "Text", { text: "a", tone: "default" })]),
            node("muted", "Text", { text: "muted", tone: "muted" }),
            node("plain", "Text", { text: "plain", tone: "default" }),
            node("photo", "Image", { url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", description: "Square", aspect: "square" }),
            node("items", "List", { items: ["orzo", "butter"], ordered: false }),
          ]),
        })}
      />,
    );
    const ref = await render(
      <>
        <Stack gap="sm" />
        <Row wrap gap="sm" />
        <Text tone="muted">x</Text>
        <Text>x</Text>
      </>,
    );
    const column = host.querySelector('[data-ouro="composed-surface"] > *')!;
    const [row, muted, plain, photo, list] = [...column.children];
    expect(column.className).toBe(ref.children[0]!.className);
    expect(row!.className).toBe(ref.children[1]!.className);
    expect(muted!.className).toBe(ref.children[2]!.className);
    expect(plain!.className).toBe(ref.children[3]!.className);
    expect(photo!.getAttribute("data-ouro")).toBe("aspect-ratio");
    expect(photo!.querySelector("img")!.getAttribute("alt")).toBe("Square");
    expect(list!.tagName).toBe("UL");
    expect(list!.className).toContain("list-disc");
    expect(warn).not.toHaveBeenCalled();
  });

  it("puts a Card's first Image in its media slot, and a Card that opens with anything else, or holds nothing, has no media", async () => {
    const host = await render(<ComposedSurface {...props()} />);
    const img = host.querySelector('[data-ouro="card"] img')!;
    expect(page.getByRole("heading", { level: 1 }).element().parentElement!.contains(img)).toBe(false);
    const plain = await render(<ComposedSurface {...props({ tree: node("root", "Card", {}, [node("name", "Heading", { text: "No photo", level: 2 }), node("photo", "Image", { url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", description: "Later", aspect: "square" })]) })} />);
    const card = plain.querySelector('[data-ouro="card"]')!;
    expect(card.querySelectorAll("img")).toHaveLength(1);
    expect(card.querySelector("h2")!.parentElement!.contains(card.querySelector("img"))).toBe(true);
    const empty = await render(<ComposedSurface {...props({ tree: node("root", "Card") })} />);
    expect(empty.querySelector('[data-ouro="card"]')).not.toBeNull();
    expect(empty.querySelector("img")).toBeNull();
  });

  it("draws the primary button solid and the others soft, as HX's own buttons", async () => {
    const host = await render(<ComposedSurface {...props()} />);
    const ref = await render(
      <>
        <Button tone="primary" variant="solid">
          x
        </Button>
        <Button tone="secondary" variant="soft">
          x
        </Button>
      </>,
    );
    const [solid, soft] = [...ref.querySelectorAll("button")];
    const shop = host.querySelector('button[data-action="add_recipe_to_shopping_list"]')!;
    const share = host.querySelector('button[data-action="share_recipe"]')!;
    expect([shop.getAttribute("data-variant"), share.getAttribute("data-variant")]).toEqual(["solid", "soft"]);
    expect(shop.className).toBe(solid!.className);
    expect(share.className).toBe(soft!.className);
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

describe("ComposedSurface fields", () => {
  const bound = (path: string) => ({ "@path": path });
  const data = { recipe: { id: "rcp_1" }, servings: 4, vegetarian: false, oven: "Fan", note: "No peas", title: "Orzo", share: { with: "" } };
  const fields = node("root", "Stack", { direction: "vertical", gap: "medium" }, [
    node("servings", "TextField", { label: "Servings", value: "/servings", hint: "How many people you're cooking for.", type: "number", multiline: false }),
    node("vegetarian", "Checkbox", { label: "Make it vegetarian", value: "/vegetarian", hint: "Swaps the stock." }),
    node("oven", "Select", { label: "Oven", value: "/oven", options: ["Fan", "Conventional", "Grill"], hint: "Changes the temperature." }),
    node("note", "TextField", { label: "Note", value: "/note", type: "text", multiline: true }),
    node("title", "TextField", { label: "Title", value: "/title", type: "text", multiline: false }),
    node("with", "TextField", { label: "Send to", value: "/share/with", type: "text", multiline: false }),
    node("plan", "ActionButton", {
      ...actionButtonProps(catalog, "plan_dinner", { recipe: bound("/recipe/id"), servings: bound("/servings"), vegetarian: bound("/vegetarian"), oven: bound("/oven"), note: bound("/note"), title: bound("/title") }),
      emphasis: "primary",
    }),
    node("share", "ActionButton", { ...actionButtonProps(catalog, "share_recipe", { recipe: "rcp_1", with: bound("/share/with") }, { label: ({ value }) => named(value) }), emphasis: "secondary" }),
  ]);

  it("draws each field with HX, its label and hint, starting from what the data holds", async () => {
    expect(validateTree(catalog, fields)).toEqual([]);
    const host = await render(<ComposedSurface {...props({ tree: fields, data })} />);
    expect(page.getByRole("textbox", { name: "Servings" }).element()).toHaveValue("4");
    expect(page.getByRole("textbox", { name: "Servings" }).element().closest('[data-ouro="number-field"]')).not.toBeNull();
    expect(page.getByRole("textbox", { name: "Servings" }).element()).toHaveAccessibleDescription("How many people you're cooking for.");
    expect(page.getByRole("checkbox", { name: "Make it vegetarian" }).element()).not.toBeChecked();
    expect(page.getByRole("checkbox", { name: "Make it vegetarian" }).element()).toHaveAccessibleDescription("Swaps the stock.");
    expect(page.getByRole("combobox", { name: "Oven" }).element().textContent).toContain("Fan");
    expect(page.getByRole("textbox", { name: "Note" }).element().tagName).toBe("TEXTAREA");
    expect(page.getByRole("textbox", { name: "Note" }).element()).toHaveValue("No peas");
    expect(page.getByRole("textbox", { name: "Title" }).element()).toHaveValue("Orzo");
    expect(host.querySelectorAll('[data-ouro="text-field"]')).toHaveLength(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it("presses a bound button with what the person typed, ticked and chose", async () => {
    const onPress = vi.fn();
    await render(<ComposedSurface {...props({ tree: fields, data, onPress })} />);
    await userEvent.fill(page.getByRole("textbox", { name: "Servings" }), "6");
    await userEvent.click(page.getByRole("checkbox", { name: "Make it vegetarian" }));
    await userEvent.click(page.getByRole("combobox", { name: "Oven" }));
    await userEvent.click(page.getByRole("option", { name: "Grill" }));
    await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
    await userEvent.fill(page.getByRole("textbox", { name: "Note" }), "Extra lemon");
    await userEvent.fill(page.getByRole("textbox", { name: "Title" }), "Weeknight orzo");
    await userEvent.click(page.getByRole("button", { name: "Plan dinner" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    const [press, button] = onPress.mock.calls[0]! as [PersonPress, ComposedNode];
    expect(press.input).toEqual({ recipe: "rcp_1", servings: 6, vegetarian: true, oven: "Grill", note: "Extra lemon", title: "Weeknight orzo" });
    expect(button.id).toBe("plan");
    expect(button.props.input).toEqual(press.input);
  });

  it("writes a number from a number field, and null when the person empties it", async () => {
    const onPress = vi.fn();
    await render(<ComposedSurface {...props({ tree: fields, data, onPress })} />);
    await userEvent.fill(page.getByRole("textbox", { name: "Servings" }), "");
    await userEvent.click(page.getByRole("button", { name: "Plan dinner" }));
    expect((onPress.mock.calls[0]![0] as PersonPress).input.servings).toBeNull();
    await userEvent.fill(page.getByRole("textbox", { name: "Servings" }), "8");
    await userEvent.click(page.getByRole("button", { name: "Plan dinner" }));
    expect((onPress.mock.calls[1]![0] as PersonPress).input.servings).toBe(8);
  });

  it("shows what the person typed on a consequential button's confirm sheet, and sends it on confirm", async () => {
    const onPress = vi.fn();
    await render(<ComposedSurface {...props({ tree: fields, data, onPress })} />);
    await userEvent.fill(page.getByRole("textbox", { name: "Send to" }), "kim@example.com");
    await userEvent.click(page.getByRole("button", { name: "Share recipe" }));
    const dialog = page.getByRole("alertdialog", { name: "Share recipe?" });
    await expect.element(dialog).toBeVisible();
    expect([...dialog.element().querySelectorAll("p span.block")].map((l) => l.textContent)).toEqual(["Recipe: Charred Lemon Orzo rcp_1", "With: kim@example.com"]);
    await userEvent.click(dialog.getByRole("button", { name: "Share recipe" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress.mock.calls[0]![0]).toEqual({ action: "share_recipe", input: { recipe: "rcp_1", with: "kim@example.com" }, consent: "consequential", label: "Share recipe", by: "person", confirmed: true });
  });

  it("starts the fields over from new data, and sends null for a bound value the data lacks", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    const onPress = vi.fn();
    await act(async () => root.render(<ComposedSurface {...props({ tree: fields, onPress })} />));
    expect(page.getByRole("textbox", { name: "Title" }).element()).toHaveValue("");
    await userEvent.click(page.getByRole("button", { name: "Plan dinner" }));
    expect((onPress.mock.calls[0]![0] as PersonPress).input).toEqual({ recipe: null, servings: null, vegetarian: null, oven: null, note: null, title: null });
    await userEvent.fill(page.getByRole("textbox", { name: "Title" }), "Typed");
    await act(async () => root.render(<ComposedSurface {...props({ tree: fields, data, onPress })} />));
    expect(page.getByRole("textbox", { name: "Title" }).element()).toHaveValue("Orzo");
    await userEvent.fill(page.getByRole("textbox", { name: "Title" }), "Typed again");
    await act(async () => root.render(<ComposedSurface {...props({ tree: fields, data, onPress })} />));
    expect(page.getByRole("textbox", { name: "Title" }).element()).toHaveValue("Typed again");
    await act(async () => root.render(<ComposedSurface {...props({ tree: { ...fields }, data, onPress })} />));
    expect(page.getByRole("textbox", { name: "Title" }).element()).toHaveValue("Orzo");
  });

  it("shows a value the data holds as text in a text field, and none in a field that can't hold it", async () => {
    await render(<ComposedSurface {...props({ tree: fields, data: { servings: "four", vegetarian: "yes", oven: "Steam", note: null, title: 12 } })} />);
    expect(page.getByRole("textbox", { name: "Servings" }).element()).toHaveValue("");
    expect(page.getByRole("checkbox", { name: "Make it vegetarian" }).element()).not.toBeChecked();
    expect(page.getByRole("combobox", { name: "Oven" }).element().textContent).not.toMatch(/Fan|Conventional|Grill|Steam/);
    expect(page.getByRole("textbox", { name: "Note" }).element()).toHaveValue("");
    expect(page.getByRole("textbox", { name: "Title" }).element()).toHaveValue("12");
  });

  it("warns when a guessed dataModel takes the place of data", async () => {
    await render(<ComposedSurface {...props()} {...({ dataModel: {} } as object)} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ComposedSurface: dataModel is not a prop; the fields' data model is data. Fix: <ComposedSurface data={structuredContent.ouro.data} />."));
  });
});
