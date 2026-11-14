import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { OuroMcpApp } from "@/registry/ouro/components/ouro/mcp-app/ouro-mcp-app";
import type { McpAppHostLink, McpAppMessage } from "@/registry/ouro/lib/ouro/mcp-app";

// The view as an MCP host frames it, with the story playing the host: it answers the handshake, sends a card as the
// tool's result, answers each tool call, and lists below what the view asked of it. The catalog is a recipe app's, as
// core's ouro-a2ui-catalog.mts writes it, cut to what the view reads; the card is the one a model composed (core's
// conformance case recipe-card-agent.json, a synthetic recipe), cut to its head and buttons, with its photo drawn
// here so the story needs no network.

const ORZO =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e9dfd0"/><ellipse cx="200" cy="155" rx="160" ry="135" fill="#2b2b2e"/><ellipse cx="200" cy="155" rx="140" ry="118" fill="#e2b04f"/><g fill="#f5d94a" stroke="#e2b92a" stroke-width="4"><circle cx="145" cy="110" r="28"/><circle cx="265" cy="190" r="28"/></g></svg>',
  );
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
              "refusal": {
                "ax": "outcome/1",
                "action": "recipe order",
                "state": "refused",
                "summary": "recipe order: You can't place an order or pay for the person; only they can. Ask the person, who does it with Order ingredients on the recipe in the app.",
                "error": {
                  "code": "person-only",
                  "exit": 2,
                  "thing": "recipe order",
                  "problem": "You can't place an order or pay for the person; only they can. Ask the person, who does it with Order ingredients on the recipe in the app",
                  "fix": null,
                  "message": "recipe order: You can't place an order or pay for the person; only they can. Ask the person, who does it with Order ingredients on the recipe in the app."
                }
              }
            }
          }
        }
      }
    }
  }
};

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

/** What the recipe app's tools answer. */
const TOOLS: Record<string, string> = {
  get_recipe: "Charred Lemon Orzo: toast the orzo in brown butter, simmer, finish with peas and lemon.",
  add_recipe_to_shopping_list: "Added 6 ingredients to your shopping list.",
  share_recipe: "Shared Charred Lemon Orzo with sam@example.com.",
};

/** A host in the page: answers the view as an MCP Apps host would, and logs each request. */
function storyHost(log: (line: string) => void): McpAppHostLink {
  let listener: ((message: unknown) => void) | undefined;
  const send = (message: object) => queueMicrotask(() => listener?.({ jsonrpc: "2.0", ...message }));
  return {
    post: (m: McpAppMessage) => {
      if (m.method === "ui/initialize") send({ id: m.id, result: { protocolVersion: "2026-01-26", hostInfo: { name: "story", version: "1.0.0" }, hostCapabilities: { openLinks: {}, serverTools: {} }, hostContext: { displayMode: "inline" } } });
      else if (m.method === "ui/notifications/initialized") send({ method: "ui/notifications/tool-result", params: { content: [{ type: "text", text: "Here is Charred Lemon Orzo." }], structuredContent: { a2ui: { version: "1.0", catalogId: catalog.catalogId, messages } } } });
      else if (m.method === "tools/call") {
        const { name, arguments: args } = m.params as { name: string; arguments: unknown };
        log(`tools/call ${name} ${JSON.stringify(args)}`);
        send({ id: m.id, result: { content: [{ type: "text", text: TOOLS[name] }] } });
      } else if (m.method === "ui/open-link") {
        log(`ui/open-link ${(m.params as { url: string }).url}`);
        send({ id: m.id, result: {} });
      }
    },
    listen: (onMessage) => {
      listener = onMessage;
      return () => {
        listener = undefined;
      };
    },
  };
}

function HostedCard() {
  const [lines, setLines] = useState<string[]>([]);
  const host = useMemo(() => storyHost((line) => setLines((all) => [...all, line])), []);
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 420 }}>
      <OuroMcpApp catalog={catalog} host={host} appInfo={{ name: "Recipes", version: "1.0.0" }} handoffUrl={({ action }) => `https://kitchen.example.com/recipes/rcp_lemon_orzo?do=${action}`} />
      <section aria-label="What the host got" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "var(--muted-foreground)" }}>
        <ol data-host-log="" style={{ margin: 0, paddingInlineStart: 20 }}>
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}

const meta = {
  title: "Display/OuroMcpApp",
  component: OuroMcpApp,
  parameters: { layout: "padded" },
  args: { catalog },
  render: () => <HostedCard />,
} satisfies Meta<typeof OuroMcpApp>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The recipe card a tool returned, in its host: write buttons call their tool, Share asks first, Order opens the app. */
export const InHost: Story = {};
