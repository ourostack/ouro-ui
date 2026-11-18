import { actionButtonProps, loadCatalog, type ComposedNode, type Obj, type ResolveOptions } from "@/registry/ouro/lib/ouro/a2ui-core";
import catalogJson from "@/test/fixtures/a2ui/recipe.catalog.json";

// A recipe card as Ouro's composed tree, built in code from a recipe app's catalog and a synthetic recipe, with no A2UI
// in between: what a server hands core's `mcpAppTreeResult`, and what ComposedSurface draws. Each button's label,
// consent and confirm sheet come from the catalog through core's `actionButtonProps`.

/** The recipe app's catalog, read back as Ouro's own. */
export const recipeCatalog = loadCatalog(catalogJson);

/** The picture's address on the live site; the docs demo swaps in the copy its build ships. */
export const ORZO_URL = "https://ui.ouroboros.bot/a2ui/v1/examples/charred-lemon-orzo.png";

const node = (id: string, component: string, props: Obj = {}, children: ComposedNode[] = []): ComposedNode => ({ id, component, props, children });
const button = (id: string, action: string, input: Obj, emphasis: "primary" | "secondary", options: ResolveOptions): ComposedNode =>
  node(id, "ActionButton", { ...actionButtonProps(recipeCatalog, action, input, options), emphasis });

/** The card: a photo, the recipe and its facts, and one button per consent class. `label` names ids on the confirm sheet. */
export function recipeTree(options: ResolveOptions & { image?: string } = {}): ComposedNode {
  const { image = ORZO_URL, ...resolve } = options;
  return node("root", "Card", {}, [
    node("photo", "Image", { url: image, description: "A shallow pan of golden orzo with peas and charred lemon halves", aspect: "landscape" }),
    node("name", "Heading", { text: "Charred Lemon Orzo", level: 1 }),
    node("about", "Text", { text: "Orzo toasted in brown butter, finished with charred lemon and peas. A weeknight pan dinner.", tone: "muted" }),
    node("tags", "Stack", { direction: "horizontal", gap: "small" }, [node("tag", "Badge", { text: "Vegetarian", tone: "neutral" }), node("tag", "Badge", { text: "One pan", tone: "neutral" })]),
    node("facts", "DescriptionList", { items: [{ term: "Time", detail: "25 min" }, { term: "Servings", detail: "4" }] }),
    node("line", "Separator"),
    node("buttons", "Stack", { direction: "vertical", gap: "small" }, [
      button("open", "get_recipe", { recipe: "rcp_lemon_orzo" }, "primary", resolve),
      button("shop", "add_recipe_to_shopping_list", { recipe: "rcp_lemon_orzo", servings: 4 }, "secondary", resolve),
      button("share", "share_recipe", { recipe: "rcp_lemon_orzo", with: "sam@example.com" }, "secondary", resolve),
      button("order", "order_ingredients", {}, "secondary", resolve),
    ]),
  ]);
}

/**
 * The same card asking the person two things: how many servings to shop for, and who to share it with. Each field
 * writes to the data model, and the buttons bound to it send what the person entered (core's 2026-11-17 fields record).
 */
export function recipeFormTree(options: ResolveOptions & { image?: string } = {}): { tree: ComposedNode; data: Obj } {
  const { image = ORZO_URL, ...resolve } = options;
  const tree = node("root", "Card", {}, [
    node("photo", "Image", { url: image, description: "A shallow pan of golden orzo with peas and charred lemon halves", aspect: "landscape" }),
    node("name", "Heading", { text: "Charred Lemon Orzo", level: 1 }),
    node("about", "Text", { text: "Orzo toasted in brown butter, finished with charred lemon and peas. A weeknight pan dinner.", tone: "muted" }),
    node("servings", "TextField", { label: "Servings", value: "/servings", type: "number", multiline: false, hint: "How many people you're cooking for." }),
    node("share-with", "TextField", { label: "Share with", value: "/share/with", type: "text", multiline: false, hint: "An email address." }),
    node("line", "Separator"),
    node("buttons", "Stack", { direction: "vertical", gap: "small" }, [
      button("shop", "add_recipe_to_shopping_list", { recipe: "rcp_lemon_orzo", servings: { "@path": "/servings" } }, "primary", resolve),
      button("share", "share_recipe", { recipe: "rcp_lemon_orzo", with: { "@path": "/share/with" } }, "secondary", resolve),
      button("order", "order_ingredients", {}, "secondary", resolve),
    ]),
  ]);
  return { tree, data: { servings: 4, share: { with: "" } } };
}
