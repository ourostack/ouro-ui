import type { Meta, StoryObj } from "@storybook/react-vite";
import { A2UISurface } from "@/registry/ouro/components/ouro/a2ui-surface/a2ui-surface";

// The card a model (claude-sonnet-4-6) composed from a recipe app's catalog and a synthetic recipe, unedited except
// for its photo, which is drawn here so the story needs no network. Core keeps the original as the conformance case
// recipe-card-agent.json. Layout here uses inline styles and the theme's CSS variables (shadcn's names).

const ORZO =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e9dfd0"/><ellipse cx="200" cy="155" rx="160" ry="135" fill="#2b2b2e"/><rect x="345" y="140" width="60" height="24" rx="10" fill="#2b2b2e"/><ellipse cx="200" cy="155" rx="140" ry="118" fill="#e2b04f"/><g fill="#6aa84f"><circle cx="150" cy="120" r="6"/><circle cx="240" cy="110" r="6"/><circle cx="190" cy="200" r="6"/><circle cx="260" cy="170" r="6"/><circle cx="120" cy="180" r="6"/><circle cx="215" cy="150" r="6"/></g><g fill="#f5d94a" stroke="#e2b92a" stroke-width="4"><circle cx="145" cy="110" r="28"/><circle cx="265" cy="190" r="28"/></g><g fill="#3b2a1a" opacity=".55"><circle cx="140" cy="104" r="5"/><circle cx="154" cy="118" r="4"/><circle cx="270" cy="184" r="5"/><circle cx="258" cy="198" r="4"/></g></svg>',
  );

/** A recipe app's catalog, as core's ouro-a2ui-catalog.mts writes it, cut to what the surface reads. */
const catalog = {
  "catalogId": "https://ui.ouroboros.bot/a2ui/v1/apps/recipe/catalog.json",
  "components": {
    "Card": {},
    "Stack": {},
    "Heading": {},
    "Text": {},
    "Image": {},
    "Badge": {},
    "List": {},
    "DescriptionList": {},
    "Separator": {},
    "Alert": {},
    "ActionButton": {}
  },
  "metadata": {
    "extensions": {
      "bot_ouroboros_hx": {
        "actions": {
          "get_recipe": {
            "consent": "read",
            "press": "run",
            "label": "Open recipe",
            "description": "Open the whole recipe.",
            "input": {
              "recipe": {
                "label": "Recipe",
                "kind": "string",
                "optional": false
              }
            }
          },
          "add_recipe_to_shopping_list": {
            "consent": "write",
            "press": "run",
            "label": "Add ingredients to list",
            "description": "Add this recipe's ingredients to your shopping list.",
            "input": {
              "recipe": {
                "label": "Recipe",
                "kind": "string",
                "optional": false
              },
              "servings": {
                "label": "Servings",
                "kind": "integer",
                "optional": true
              }
            }
          },
          "share_recipe": {
            "consent": "consequential",
            "press": "confirm",
            "label": "Share recipe",
            "description": "Send this recipe to someone.",
            "input": {
              "recipe": {
                "label": "Recipe",
                "kind": "string",
                "optional": false
              },
              "with": {
                "label": "Send to",
                "kind": "string",
                "optional": false
              }
            }
          },
          "order_ingredients": {
            "consent": "person-only",
            "press": "handoff",
            "label": "Order ingredients",
            "description": "Order this recipe's ingredients for delivery and pay for them.",
            "input": {
              "recipe": {
                "label": "Recipe",
                "kind": "string",
                "optional": false
              }
            },
            "personOnly": {
              "how": "with Order ingredients on the recipe in the app",
              "refusal": {}
            }
          }
        }
      }
    }
  }
};

/** The model's messages. */
const messages = [
  {
    "version": "1.0",
    "createSurface": {
      "surfaceId": "recipe-card",
      "catalogId": "https://ui.ouroboros.bot/a2ui/v1/apps/recipe/catalog.json",
      "dataModel": {
        "id": "rcp_lemon_orzo",
        "name": "Charred Lemon Orzo",
        "description": "Orzo toasted in brown butter, finished with charred lemon, peas and a lot of parmesan. A weeknight pan dinner.",
        "image": ORZO,
        "imageDescription": "A shallow pan of golden orzo with peas and charred lemon halves",
        "minutes": 25,
        "minutesDisplay": "25 min",
        "servings": 4,
        "difficulty": "Easy",
        "tags": [
          "Vegetarian",
          "One pan"
        ],
        "ingredients": [
          {
            "quantity": "1½ cups",
            "name": "orzo"
          },
          {
            "quantity": "3 tbsp",
            "name": "butter"
          },
          {
            "quantity": "2",
            "name": "lemons, halved"
          },
          {
            "quantity": "1 cup",
            "name": "frozen peas"
          },
          {
            "quantity": "¾ cup",
            "name": "grated parmesan"
          },
          {
            "quantity": "3 cups",
            "name": "vegetable stock"
          }
        ],
        "sharedWith": "sam@example.com"
      },
      "components": [
        {
          "id": "root",
          "component": "Card",
          "children": [
            "main_stack"
          ]
        },
        {
          "id": "main_stack",
          "component": "Stack",
          "direction": "vertical",
          "gap": "medium",
          "children": [
            "recipe_image",
            "recipe_name",
            "recipe_description",
            "tags_stack",
            "facts_separator",
            "recipe_facts",
            "ingredients_separator",
            "ingredients_heading",
            "ingredients_stack",
            "actions_separator",
            "actions_stack"
          ]
        },
        {
          "id": "recipe_image",
          "component": "Image",
          "url": {
            "@path": "/image"
          },
          "description": {
            "@path": "/imageDescription"
          },
          "aspect": "landscape"
        },
        {
          "id": "recipe_name",
          "component": "Heading",
          "text": {
            "@path": "/name"
          },
          "level": 1
        },
        {
          "id": "recipe_description",
          "component": "Text",
          "text": {
            "@path": "/description"
          },
          "tone": "muted"
        },
        {
          "id": "tags_stack",
          "component": "Stack",
          "direction": "horizontal",
          "gap": "small",
          "children": {
            "componentId": "tag_badge",
            "path": "/tags"
          }
        },
        {
          "id": "tag_badge",
          "component": "Badge",
          "text": {
            "@path": ""
          }
        },
        {
          "id": "facts_separator",
          "component": "Separator"
        },
        {
          "id": "recipe_facts",
          "component": "DescriptionList",
          "items": [
            {
              "term": "Time",
              "detail": {
                "@path": "/minutesDisplay"
              }
            },
            {
              "term": "Servings",
              "detail": {
                "@path": "/servings"
              }
            },
            {
              "term": "Difficulty",
              "detail": {
                "@path": "/difficulty"
              }
            }
          ]
        },
        {
          "id": "ingredients_separator",
          "component": "Separator"
        },
        {
          "id": "ingredients_heading",
          "component": "Heading",
          "text": "Ingredients",
          "level": 2
        },
        {
          "id": "ingredients_stack",
          "component": "Stack",
          "direction": "vertical",
          "gap": "small",
          "children": {
            "componentId": "ingredient_item",
            "path": "/ingredients"
          }
        },
        {
          "id": "ingredient_item",
          "component": "Stack",
          "direction": "horizontal",
          "gap": "small",
          "children": [
            "ingredient_quantity",
            "ingredient_name"
          ]
        },
        {
          "id": "ingredient_quantity",
          "component": "Text",
          "text": {
            "@path": "quantity"
          },
          "tone": "muted"
        },
        {
          "id": "ingredient_name",
          "component": "Text",
          "text": {
            "@path": "name"
          }
        },
        {
          "id": "actions_separator",
          "component": "Separator"
        },
        {
          "id": "actions_stack",
          "component": "Stack",
          "direction": "vertical",
          "gap": "small",
          "children": [
            "btn_open",
            "btn_shopping",
            "btn_share",
            "btn_order"
          ]
        },
        {
          "id": "btn_open",
          "component": "ActionButton",
          "action": "get_recipe",
          "input": {
            "recipe": {
              "@path": "/id"
            }
          },
          "emphasis": "primary"
        },
        {
          "id": "btn_shopping",
          "component": "ActionButton",
          "action": "add_recipe_to_shopping_list",
          "input": {
            "recipe": {
              "@path": "/id"
            },
            "servings": {
              "@path": "/servings"
            }
          },
          "emphasis": "secondary"
        },
        {
          "id": "btn_share",
          "component": "ActionButton",
          "action": "share_recipe",
          "input": {
            "recipe": {
              "@path": "/id"
            },
            "with": {
              "@path": "/sharedWith"
            }
          },
          "emphasis": "secondary"
        },
        {
          "id": "btn_order",
          "component": "ActionButton",
          "action": "order_ingredients",
          "emphasis": "secondary"
        }
      ]
    }
  }
];

const meta = {
  title: "Display/A2UISurface",
  component: A2UISurface,
  parameters: { layout: "padded" },
  args: { catalog, messages, onAction: () => {}, onHandoff: () => {}, onProblems: () => {} },
  render: (args) => (
    <div style={{ maxWidth: 420 }}>
      <A2UISurface {...args} />
    </div>
  ),
} satisfies Meta<typeof A2UISurface>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A card the agent composed: a photo, the recipe, its facts and ingredients, and one button per consent class. */
export const RecipeCard: Story = {};

/** Messages that fail core's validator: the person sees a short alert, and `onProblems` gets the details for the agent. */
export const Invalid: Story = {
  args: {
    messages: [{ version: "1.0", createSurface: { surfaceId: "card", catalogId: catalog.catalogId, components: [{ id: "root", component: "Button", label: "Buy now" }] } }],
  },
};
