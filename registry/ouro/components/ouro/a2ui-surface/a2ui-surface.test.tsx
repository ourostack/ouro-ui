import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { A2UISurface, type A2UIActionMessage, type A2UISurfaceProps } from "@/registry/ouro/components/ouro/a2ui-surface/a2ui-surface";
import { AspectRatio } from "@/registry/ouro/components/ouro/aspect-ratio/aspect-ratio";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Row } from "@/registry/ouro/components/ouro/stack/row";
import { Stack } from "@/registry/ouro/components/ouro/stack/stack";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in Chromium and WebKit. The catalog is a recipe app's, cut down to what these tests use; an app generates
// its own with core's ouro-a2ui-catalog.mts.

const field = (label: string, kind = "string", optional = false) => ({ label, kind, optional });
const catalog = {
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
};

const surface = (components: unknown[], dataModel: unknown = {}) => [{ version: "1.0", createSurface: { surfaceId: "card", catalogId: catalog.catalogId, dataModel, components } }];

const recipe = surface(
  [
    { id: "root", component: "Card", children: ["photo", "name", "about", "tags", "facts", "line", "steps", "items", "note", "notice", "buttons"] },
    { id: "photo", component: "Image", url: { "@path": "/image" }, description: "A pan of orzo", aspect: "wide" },
    { id: "name", component: "Heading", text: { "@path": "/name" }, level: 1 },
    { id: "about", component: "Text", text: "A weeknight pan dinner.", tone: "muted" },
    { id: "tags", component: "Stack", direction: "horizontal", gap: "small", children: { componentId: "tag", path: "/tags" } },
    { id: "tag", component: "Badge", text: { "@path": "" } },
    { id: "facts", component: "DescriptionList", items: [{ term: "Time", detail: "25 min" }, { term: "Serves", detail: { "@path": "/servings" } }] },
    { id: "line", component: "Separator" },
    { id: "steps", component: "List", items: ["Toast", "Simmer"], ordered: true },
    { id: "items", component: "List", items: { "@path": "/ingredients" } },
    { id: "note", component: "Alert", title: "Contains dairy", tone: "warning" },
    { id: "notice", component: "Alert", title: "Saved", text: "It's in your cookbook.", tone: "success" },
    { id: "buttons", component: "Stack", gap: "none", children: ["shop", "share", "order"] },
    { id: "shop", component: "ActionButton", action: "add_recipe_to_shopping_list", emphasis: "primary", input: { recipe: { "@path": "/id" }, servings: { "@path": "/servings" } } },
    { id: "share", component: "ActionButton", action: "share_recipe", input: { recipe: { "@path": "/id" }, with: "sam@example.com" } },
    { id: "order", component: "ActionButton", action: "order_ingredients" },
  ],
  { id: "rcp_1", name: "Charred Lemon Orzo", image: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", tags: ["Vegetarian", "One pan"], servings: 4, ingredients: ["orzo", "butter"] },
);

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

function props(overrides: Partial<A2UISurfaceProps> = {}): A2UISurfaceProps {
  return { catalog, messages: recipe, onAction: vi.fn(), onHandoff: vi.fn(), ...overrides };
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

describe("A2UISurface", () => {
  it("renders the agent's card with HX components, its data bound and its template repeated", async () => {
    const host = await render(<A2UISurface {...props()} className="max-w-md" />);
    const root = host.querySelector('[data-ouro="a2ui-surface"]')!;
    expect(root.getAttribute("data-surface-id")).toBe("card");
    expect(root.className).toContain("max-w-md");
    expect(root.querySelector('[data-ouro="card"] img')!.getAttribute("alt")).toBe("A pan of orzo");
    expect(page.getByRole("heading", { level: 1, name: "Charred Lemon Orzo" }).element()).toBeTruthy();
    expect([...root.querySelectorAll('[data-ouro="badge"]')].map((b) => b.textContent)).toEqual(["Vegetarian", "One pan"]);
    expect([...root.querySelectorAll("dd")].map((d) => d.textContent)).toEqual(["25 min", "4"]);
    expect([...root.querySelectorAll("ol li")].map((li) => li.textContent)).toEqual(["Toast", "Simmer"]);
    expect([...root.querySelectorAll("ul li")].map((li) => li.textContent)).toEqual(["orzo", "butter"]);
    expect(root.querySelectorAll('[data-ouro="separator"]')).toHaveLength(1);
    expect(root.querySelectorAll('[data-ouro="alert"]')).toHaveLength(2);
    expect(root.querySelector('[data-ouro="alert"]')!.textContent).toContain("Contains dairy");
    expect([...root.querySelectorAll("button[data-action]")].map((b) => b.textContent)).toEqual(["Add ingredients to list", "Share recipe", "Order ingredients"]);
  });

  it("runs a write button with the prepared input, named after its action, pressed by the person", async () => {
    let finish!: () => void;
    const onAction = vi.fn<(m: A2UIActionMessage) => Promise<void>>(() => new Promise<void>((resolve) => (finish = resolve)));
    const host = await render(<A2UISurface {...props({ onAction })} />);
    const shop = host.querySelector<HTMLButtonElement>('button[data-action="add_recipe_to_shopping_list"]')!;
    await userEvent.click(shop);
    expect(onAction).toHaveBeenCalledTimes(1);
    const { action } = onAction.mock.calls[0]![0] as { action: Record<string, unknown> };
    expect(action).toMatchObject({ name: "add_recipe_to_shopping_list", surfaceId: "card", sourceComponentId: "shop", context: { recipe: "rcp_1", servings: 4 } });
    expect(action.metadata).toEqual({ extensions: { bot_ouroboros_action: { consent: "write", by: "person" } } });
    expect(Number.isNaN(Date.parse(action.timestamp as string))).toBe(false);
    await expect.poll(() => shop.getAttribute("aria-busy")).toBe("true");
    await act(async () => finish());
    await expect.poll(() => shop.getAttribute("aria-busy")).not.toBe("true");
  });

  it("runs a button whose handler returns nothing without waiting", async () => {
    const onAction = vi.fn();
    const host = await render(<A2UISurface {...props({ onAction })} />);
    const shop = host.querySelector<HTMLButtonElement>('button[data-action="add_recipe_to_shopping_list"]')!;
    const busy: (string | null)[] = [];
    const watch = new MutationObserver(() => busy.push(shop.getAttribute("aria-busy")));
    watch.observe(shop, { attributes: true, attributeFilter: ["aria-busy"] });
    await userEvent.click(shop);
    await act(async () => {});
    watch.disconnect();
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(busy).not.toContain("true");
  });

  it("asks the person to confirm a consequential action with what the agent prepared, and sends it only on confirm", async () => {
    const onAction = vi.fn();
    const host = await render(<A2UISurface {...props({ onAction })} />);
    await userEvent.click(host.querySelector<HTMLButtonElement>('button[data-action="share_recipe"]')!);
    const dialog = page.getByRole("alertdialog", { name: "Share recipe?" });
    await expect.element(dialog).toBeVisible();
    expect(dialog.element().textContent).toContain("Send this recipe to someone.");
    expect(dialog.element().textContent).toContain("sam@example.com");
    expect(onAction).not.toHaveBeenCalled();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(onAction).not.toHaveBeenCalled();
    await userEvent.click(host.querySelector<HTMLButtonElement>('button[data-action="share_recipe"]')!);
    await userEvent.click(page.getByRole("alertdialog").getByRole("button", { name: "Share recipe" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0]![0]).toMatchObject({ action: { name: "share_recipe", context: { recipe: "rcp_1", with: "sam@example.com" }, metadata: { extensions: { bot_ouroboros_action: { consent: "consequential", by: "person", confirmed: true } } } } });
  });

  it("hands a person-only action to the app's own screen and never runs it", async () => {
    const onAction = vi.fn();
    const onHandoff = vi.fn();
    const host = await render(<A2UISurface {...props({ onAction, onHandoff })} />);
    const order = host.querySelector<HTMLButtonElement>('button[data-action="order_ingredients"]')!;
    expect(order.querySelector("svg[aria-hidden]")).not.toBeNull();
    await userEvent.click(order);
    expect(onHandoff).toHaveBeenCalledWith({ action: "order_ingredients", how: "with Order ingredients on the recipe in the app" });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("shows a short alert for messages that fail validation, and gives the problems to the app", async () => {
    const onProblems = vi.fn();
    const host = await render(<A2UISurface {...props({ onProblems, messages: surface([{ id: "root", component: "Button", label: "Buy now" }]) })} />);
    expect(host.querySelector('[data-ouro="alert"]')!.textContent).toContain("This card can't be shown");
    expect(host.querySelector("button")).toBeNull();
    expect(onProblems).toHaveBeenCalledTimes(1);
    expect(onProblems).toHaveBeenCalledWith([expect.objectContaining({ code: "VALIDATION_FAILED", surfaceId: "card", path: "/0/createSurface/components/0/component" })]);
    // Asked for a surface while the messages fail, it warns only about the messages.
    await render(<A2UISurface {...props({ messages: surface([{ id: "root", component: "Button" }]), surfaceId: "missing" })} />);
    expect(warn).not.toHaveBeenCalled();
    // A valid card gives no problems.
    const valid = vi.fn();
    await render(<A2UISurface {...props({ onProblems: valid })} />);
    expect(valid).not.toHaveBeenCalled();
  });

  it("shows the surface it is asked for, and warns when there is none", async () => {
    const two = [...recipe, ...surface([{ id: "root", component: "Text", text: "Other" }]).map((m) => ({ ...m, createSurface: { ...m.createSurface, surfaceId: "other" } }))];
    const host = await render(<A2UISurface {...props({ messages: two, surfaceId: "other" })} />);
    expect(host.textContent).toBe("Other");
    await render(<A2UISurface {...props({ messages: [] })} />);
    expect(warn).not.toHaveBeenCalled();
    const empty = await render(<A2UISurface {...props({ surfaceId: "missing" })} />);
    expect(empty.querySelector('[data-ouro="a2ui-surface"]')!.childElementCount).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('A2UISurface: no surface "missing" in the messages. Fix: <A2UISurface surfaceId="card" />.'));
    const none = await render(<A2UISurface {...props({ messages: [] })} />);
    expect(none.querySelector('[data-ouro="a2ui-surface"]')!.childElementCount).toBe(0);
  });

  it("warns when a guessed onPress takes the place of onAction", async () => {
    await render(<A2UISurface {...props()} {...({ onPress: () => {} } as object)} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("A2UISurface: onPress is not a prop; a pressed button calls onAction, or onHandoff for a person-only one. Fix: <A2UISurface onAction={send} onHandoff={openApp} />."));
  });

  it("draws every Stack gap, aspect and tone the catalog has, and a vertical Stack with defaults", async () => {
    const host = await render(
      <A2UISurface
        {...props({
          messages: surface([
            { id: "root", component: "Stack", children: ["a", "b", "c", "d", "e", "f", "g", "h", "i"] },
            { id: "a", component: "Stack", gap: "large", children: ["t"] },
            { id: "b", component: "Image", url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", description: "Square", aspect: "square" },
            { id: "c", component: "Image", url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", description: "Tall", aspect: "portrait" },
            { id: "d", component: "Badge", text: "Info", tone: "info" },
            { id: "e", component: "Badge", text: "Late", tone: "danger" },
            { id: "f", component: "Alert", title: "Heads up" },
            { id: "g", component: "Alert", title: "Failed", tone: "danger" },
            { id: "h", component: "Heading", text: "Sub", level: 3 },
            { id: "i", component: "Card", children: ["t"] },
            { id: "t", component: "Text", text: "Hi" },
          ]),
        })}
      />,
    );
    expect(host.querySelectorAll("img")).toHaveLength(2);
    expect(host.querySelector("h3")!.textContent).toBe("Sub");
    expect(host.querySelectorAll('[data-ouro="alert"]')).toHaveLength(2);
    expect(host.querySelector('[data-ouro="card"] img')).toBeNull();
  });

  it("maps each catalog gap, tone, aspect and emphasis to the HX prop it names", async () => {
    const stacks = ["none", "small", "medium", "large"].flatMap((gap) => [
      { id: `v_${gap}`, component: "Stack", gap, children: [`vt_${gap}`] },
      { id: `h_${gap}`, component: "Stack", gap, direction: "horizontal", children: [`ht_${gap}`] },
    ]);
    const stackTexts = ["none", "small", "medium", "large"].flatMap((gap) => [`vt_${gap}`, `ht_${gap}`].map((id) => ({ id, component: "Text", text: id })));
    const badges = ["neutral", "info", "success", "warning", "danger"].map((tone) => ({ id: `b_${tone}`, component: "Badge", text: tone, tone }));
    const alerts = ["info", "success", "warning", "danger"].map((tone) => ({ id: `a_${tone}`, component: "Alert", title: tone, tone }));
    const images = ["landscape", "square", "portrait", "wide"].map((aspect) => ({ id: `i_${aspect}`, component: "Image", url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", description: aspect, aspect }));
    const texts = [
      { id: "t_muted", component: "Text", text: "muted", tone: "muted" },
      { id: "t_plain", component: "Text", text: "plain" },
    ];
    const parts = [...stacks, ...badges, ...alerts, ...images, ...texts];
    const onProblems = vi.fn();
    const host = await render(<A2UISurface {...props({ onProblems, messages: surface([{ id: "root", component: "Stack", children: parts.map((c) => c.id) }, ...parts, ...stackTexts]) })} />);
    expect(onProblems.mock.calls).toEqual([]);
    const ref = await render(
      <>
        {(["none", "sm", "md", "lg"] as const).map((gap) => (
          <div key={gap} data-gap={gap}>
            <Stack gap={gap} />
            <Row wrap gap={gap} />
          </div>
        ))}
        {(["secondary", "primary", "success", "warning", "destructive"] as const).map((tone) => (
          <Badge key={tone} tone={tone}>
            x
          </Badge>
        ))}
        {[4 / 3, 1, 3 / 4, 16 / 9].map((ratio) => (
          <AspectRatio key={ratio} ratio={ratio}>
            <img alt="" />
          </AspectRatio>
        ))}
        <Text tone="muted">x</Text>
        <Text>x</Text>
      </>,
    );
    const surfaceRoot = host.querySelector('[data-ouro="a2ui-surface"] > *')!;
    const kids = [...surfaceRoot.children];
    const refGaps = [...ref.querySelectorAll("[data-gap]")];
    ["none", "small", "medium", "large"].forEach((_, i) => {
      expect(kids[i * 2]!.className, "vertical gap").toBe(refGaps[i]!.children[0]!.className);
      expect(kids[i * 2 + 1]!.className, "horizontal gap").toBe(refGaps[i]!.children[1]!.className);
    });
    const refBadges = [...ref.querySelectorAll('[data-ouro="badge"]')];
    kids.slice(8, 13).forEach((b, i) => expect(b.className, "badge tone").toBe(refBadges[i]!.className));
    expect(kids.slice(13, 17).map((a) => a.getAttribute("data-tone"))).toEqual(["primary", "success", "warning", "destructive"]);
    const refRatios = [...ref.querySelectorAll<HTMLElement>('[data-ouro="aspect-ratio"]')].map((r) => r.style.aspectRatio);
    expect(kids.slice(17, 21).map((r) => (r as HTMLElement).style.aspectRatio)).toEqual(refRatios);
    const [refMuted, refPlain] = [...ref.querySelectorAll('[data-ouro="text"]')];
    const [muted, plain] = kids.slice(21);
    expect(muted!.className).toBe(refMuted!.className);
    expect(plain!.className).toBe(refPlain!.className);
    expect(muted!.className).not.toBe(plain!.className);
  });

  it("draws a primary button solid and the others soft, as HX's own buttons", async () => {
    const host = await render(<A2UISurface {...props()} />);
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

  it("puts a Card's first Image in its media slot, lists with markers, and each prepared value on its own line", async () => {
    const host = await render(<A2UISurface {...props()} />);
    const img = host.querySelector('[data-ouro="card"] img')!;
    const heading = page.getByRole("heading", { level: 1 }).element();
    expect(heading.parentElement!.contains(img)).toBe(false);
    expect(host.querySelector("ul")!.className).toContain("list-disc");
    expect(host.querySelector("ul")!.className).toContain("ps-5");
    expect(host.querySelector("ol")!.className).toContain("list-decimal");
    await userEvent.click(host.querySelector<HTMLButtonElement>('button[data-action="share_recipe"]')!);
    const dialog = page.getByRole("alertdialog").element();
    const lines = [...dialog.querySelectorAll("p span.block")];
    expect(lines.map((l) => l.textContent)).toEqual(["Recipe: rcp_1", "With: sam@example.com"]);
    expect(lines[0]!.firstElementChild!.className).toContain("font-medium");
    // A Card with no children has no media.
    const empty = await render(<A2UISurface {...props({ messages: surface([{ id: "root", component: "Card", children: [] }]) })} />);
    expect(empty.querySelector('[data-ouro="card"]')).not.toBeNull();
  });

  it("shows new messages when the agent sends them, and gives new problems again", async () => {
    const onProblems = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(<A2UISurface {...props({ onProblems, messages: surface([{ id: "root", component: "Text", text: "First" }]) })} />));
    expect(host.textContent).toBe("First");
    await act(async () => root.render(<A2UISurface {...props({ onProblems, messages: surface([{ id: "root", component: "Text", text: "Second" }]) })} />));
    expect(host.textContent).toBe("Second");
    await act(async () => root.render(<A2UISurface {...props({ onProblems, messages: surface([{ id: "root", component: "Button" }]) })} />));
    await act(async () => root.render(<A2UISurface {...props({ onProblems, messages: surface([{ id: "root", component: "Link" }]) })} />));
    expect(onProblems).toHaveBeenCalledTimes(2);
  });
});
