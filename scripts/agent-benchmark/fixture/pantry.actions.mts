// The benchmark's actions, declared once with Ouro UI's action model (the vendored ouro-actions.mts, core v0.7.2).
// A synthetic app shaped like Spoonjoy's shopping list and recipes: not Spoonjoy's code or data. The action-model arm
// serves the MCP tools generated from these declarations (fixture/generated/mcp.json); the web screen's controls
// carry the generated props (fixture/generated/web.ts); every door calls the one handler in store.mjs.
import { defineAction, defineActions, field } from "../vendor/ouro-actions/ouro-actions.mts";

export const getShoppingList = defineAction({
  id: "get_shopping_list",
  consent: "read",
  label: "Shopping list",
  description: "See what's on your shopping list.",
  agent: "Read the person's shopping list: each item's id, name, quantity, unit and whether it is checked.",
  input: {},
  output: { items: field.string({ label: "Items", description: "The list's items, as JSON." }) },
  cli: "list show",
});

export const addShoppingListItem = defineAction({
  id: "add_shopping_list_item",
  consent: "write",
  label: "Add to list",
  description: "Add an item to your shopping list.",
  agent: "Add one item to the person's shopping list. Give the name as the person said it; leave quantity and unit out when they gave none.",
  input: {
    name: field.string({ label: "Item", description: "What to buy, as the person said it, such as \"oat milk\".", arg: true }),
    quantity: field.number({ label: "Quantity", description: "How many or how much.", optional: true, min: 0 }),
    unit: field.string({ label: "Unit", description: "The unit of the quantity, such as g, cups or cartons.", optional: true }),
  },
  output: {
    id: field.string({ label: "Item id", description: "The new item's id." }),
    name: field.string({ label: "Item", description: "The item's name as stored." }),
  },
  cli: "list add",
});

export const setShoppingListItemChecked = defineAction({
  id: "set_shopping_list_item_checked",
  consent: "write",
  label: "Bought",
  description: "Tick an item off your shopping list, or untick it.",
  agent: "Mark one item on the person's shopping list as bought (checked) or not bought. Take the id from get_shopping_list.",
  input: {
    id: field.string({ label: "Item id", description: "The item's id, from get_shopping_list.", arg: true }),
    checked: field.boolean({ label: "Bought", description: "true when the item is bought, false to put it back." }),
  },
  output: {},
  cli: "list check",
});

export const searchRecipes = defineAction({
  id: "search_recipes",
  consent: "read",
  label: "Search recipes",
  description: "Find a recipe in your kitchen.",
  agent: "Search the person's recipes by title. Returns each match's id and title.",
  input: { query: field.string({ label: "Search", description: "Words from the recipe's title.", arg: true }) },
  output: { recipes: field.string({ label: "Recipes", description: "The matching recipes, as JSON." }) },
  cli: "recipes search",
});

export const addRecipeToShoppingList = defineAction({
  id: "add_recipe_to_shopping_list",
  consent: "write",
  label: "Add ingredients to list",
  description: "Put a recipe's ingredients on your shopping list.",
  agent: "Add every ingredient of one recipe to the person's shopping list. Take the recipe's id from search_recipes.",
  input: { recipeId: field.string({ label: "Recipe", description: "The recipe's id, from search_recipes.", arg: true }) },
  output: { added: field.integer({ label: "Added", description: "How many items were added." }) },
  cli: "recipes add-to-list",
});

export const placeGroceryOrder = defineAction({
  id: "place_grocery_order",
  consent: "person-only",
  label: "Place order",
  description: "Order everything on your list and pay for it.",
  agent: "Order the shopping list's items for delivery and pay for them.",
  input: { store: field.enum({ label: "Store", description: "Which store delivers.", values: ["corner", "market"] }) },
  output: {},
  personOnly: {
    reason: "You can't place an order or pay for the person; only they can.",
    how: "with Place order on the shopping list",
  },
  cli: "list order",
});

export default defineActions("pantry", [getShoppingList, addShoppingListItem, setShoppingListItemChecked, searchRecipes, addRecipeToShoppingList, placeGroceryOrder], { tool: "pantry" });
