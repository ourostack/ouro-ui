import type { Meta, StoryObj } from "@storybook/react-vite";
import { ComposedSurface } from "@/registry/ouro/components/ouro/composed-surface/composed-surface";
import type { ComposedNode, Obj } from "@/registry/ouro/lib/ouro/a2ui-core";

// A recipe card as Ouro's composed tree, written out as a server hands it to core's mcpAppTreeResult: each button's
// label, consent and confirm sheet are the recipe app's catalog's (core's actionButtonProps). The data is synthetic and
// the photo is drawn here so the story needs no network. Layout here uses inline styles.

const ORZO =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e9dfd0"/><ellipse cx="200" cy="155" rx="160" ry="135" fill="#2b2b2e"/><rect x="345" y="140" width="60" height="24" rx="10" fill="#2b2b2e"/><ellipse cx="200" cy="155" rx="140" ry="118" fill="#e2b04f"/><g fill="#6aa84f"><circle cx="150" cy="120" r="6"/><circle cx="240" cy="110" r="6"/><circle cx="190" cy="200" r="6"/><circle cx="260" cy="170" r="6"/><circle cx="120" cy="180" r="6"/><circle cx="215" cy="150" r="6"/></g><g fill="#f5d94a" stroke="#e2b92a" stroke-width="4"><circle cx="145" cy="110" r="28"/><circle cx="265" cy="190" r="28"/></g><g fill="#3b2a1a" opacity=".55"><circle cx="140" cy="104" r="5"/><circle cx="154" cy="118" r="4"/><circle cx="270" cy="184" r="5"/><circle cx="258" cy="198" r="4"/></g></svg>',
  );

const node = (id: string, component: string, props: Obj = {}, children: ComposedNode[] = []): ComposedNode => ({ id, component, props, children });

/** The recipe card: a photo, the recipe and its facts, and one button per consent class. */
const tree = node("root", "Card", {}, [
  node("photo", "Image", { url: ORZO, description: "A shallow pan of golden orzo with peas and charred lemon halves", aspect: "landscape" }),
  node("name", "Heading", { text: "Charred Lemon Orzo", level: 1 }),
  node("about", "Text", { text: "Orzo toasted in brown butter, finished with charred lemon and peas. A weeknight pan dinner.", tone: "muted" }),
  node("tags", "Stack", { direction: "horizontal", gap: "small" }, [node("tag", "Badge", { text: "Vegetarian", tone: "neutral" }), node("tag", "Badge", { text: "One pan", tone: "neutral" })]),
  node("facts", "DescriptionList", { items: [{ term: "Time", detail: "25 min" }, { term: "Servings", detail: "4" }] }),
  node("line", "Separator"),
  node("buttons", "Stack", { direction: "vertical", gap: "small" }, [
    node("open", "ActionButton", { action: "get_recipe", label: "Open recipe", consent: "read", press: "run", input: { recipe: "rcp_lemon_orzo" }, emphasis: "primary" }),
    node("shop", "ActionButton", { action: "add_recipe_to_shopping_list", label: "Add ingredients to list", consent: "write", press: "run", input: { recipe: "rcp_lemon_orzo", servings: 4 }, emphasis: "secondary" }),
    node("share", "ActionButton", {
      action: "share_recipe",
      label: "Share recipe",
      consent: "consequential",
      press: "confirm",
      input: { recipe: "rcp_lemon_orzo", with: "sam@example.com" },
      confirm: {
        title: "Share recipe",
        description: "Send this recipe to someone.",
        fields: [
          { label: "Recipe", value: "Charred Lemon Orzo", raw: "rcp_lemon_orzo" },
          { label: "Send to", value: "sam@example.com" },
        ],
      },
      emphasis: "secondary",
    }),
    node("order", "ActionButton", { action: "order_ingredients", label: "Order ingredients", consent: "person-only", press: "handoff", input: {}, handoff: "with Order ingredients on the recipe in the app", emphasis: "secondary" }),
  ]),
]);

const meta = {
  title: "Display/ComposedSurface",
  component: ComposedSurface,
  parameters: { layout: "padded" },
  args: { tree, onPress: () => {}, onHandoff: () => {} },
  render: (args) => (
    <div style={{ maxWidth: 420 }}>
      <ComposedSurface {...args} />
    </div>
  ),
} satisfies Meta<typeof ComposedSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A recipe card as a composed tree: a photo, the recipe and its facts, and one button per consent class. */
export const RecipeCard: Story = {};
