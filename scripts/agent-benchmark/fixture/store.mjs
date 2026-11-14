/* global structuredClone */
// Pantry's state and its one handler per action. A synthetic kitchen shaped like Spoonjoy's shopping list and
// recipes: made-up items and recipes, no person's data. Every door (the web screen's forms, the generated MCP tools,
// the hand-written MCP tools and the bridge) changes state only through these handlers, so a task's postcondition
// reads the same state whichever arm ran it.

/** The kitchen every trial starts from. A fresh deep copy per trial, so no trial sees another's changes. */
export const SEED = Object.freeze({
  items: [
    { id: "i1", name: "eggs", quantity: 12, unit: null, checked: false },
    { id: "i2", name: "spinach", quantity: 1, unit: "bag", checked: false },
    { id: "i3", name: "lemons", quantity: 3, unit: null, checked: false },
    { id: "i4", name: "parmesan", quantity: 100, unit: "g", checked: false },
    { id: "i5", name: "olive oil", quantity: 1, unit: "bottle", checked: true },
  ],
  recipes: [
    {
      id: "r1",
      title: "Charred Lemon Orzo",
      ingredients: [
        { name: "orzo", quantity: 250, unit: "g" },
        { name: "lemons", quantity: 2, unit: null },
        { name: "garlic", quantity: 3, unit: "cloves" },
        { name: "parmesan", quantity: 50, unit: "g" },
        { name: "basil", quantity: 1, unit: "bunch" },
      ],
    },
    {
      id: "r2",
      title: "Charred Corn Salad",
      ingredients: [
        { name: "corn", quantity: 4, unit: "ears" },
        { name: "feta", quantity: 150, unit: "g" },
        { name: "limes", quantity: 2, unit: null },
      ],
    },
    {
      id: "r3",
      title: "Miso Mushroom Toast",
      ingredients: [
        { name: "mushrooms", quantity: 300, unit: "g" },
        { name: "white miso", quantity: 2, unit: "tbsp" },
        { name: "sourdough", quantity: 1, unit: "loaf" },
      ],
    },
    {
      id: "r4",
      title: "Weeknight Chickpea Curry",
      ingredients: [
        { name: "chickpeas", quantity: 2, unit: "cans" },
        { name: "coconut milk", quantity: 1, unit: "can" },
        { name: "spinach", quantity: 1, unit: "bag" },
      ],
    },
  ],
  orders: [],
});

/** Thrown for input a handler refuses; every door turns it into its own error text. */
export class PantryError extends Error {}

/** A new kitchen from the seed, with the handlers that change it. */
export function createStore(seed = SEED) {
  const state = structuredClone(seed);
  let nextId = state.items.length + 1;
  const findItem = (id) => {
    const item = state.items.find((candidate) => candidate.id === id);
    if (!item) throw new PantryError(`No item has the id ${JSON.stringify(id)}. Read the list for the ids.`);
    return item;
  };
  const findRecipe = (id) => {
    const recipe = state.recipes.find((candidate) => candidate.id === id);
    if (!recipe) throw new PantryError(`No recipe has the id ${JSON.stringify(id)}. Search the recipes for the ids.`);
    return recipe;
  };
  const addItem = ({ name, quantity, unit }) => {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) throw new PantryError("An item needs a name.");
    if (quantity !== undefined && quantity !== null && (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0)) {
      throw new PantryError("Quantity must be a number of 0 or more.");
    }
    const item = { id: `i${nextId++}`, name: trimmed, quantity: quantity ?? null, unit: unit ? String(unit).trim() || null : null, checked: false };
    state.items.push(item);
    return item;
  };
  const handlers = {
    get_shopping_list: () => ({ items: JSON.stringify(state.items) }),
    add_shopping_list_item: (input) => {
      const item = addItem(input);
      return { id: item.id, name: item.name };
    },
    set_shopping_list_item_checked: ({ id, checked }) => {
      if (typeof checked !== "boolean") throw new PantryError("checked must be true or false.");
      findItem(id).checked = checked;
      return {};
    },
    remove_shopping_list_item: ({ id }) => {
      const item = findItem(id);
      state.items.splice(state.items.indexOf(item), 1);
      return {};
    },
    search_recipes: ({ query }) => {
      const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      const matches = state.recipes.filter((recipe) => words.every((word) => recipe.title.toLowerCase().includes(word)));
      return { recipes: JSON.stringify(matches.map(({ id, title }) => ({ id, title }))) };
    },
    get_recipe: ({ id }) => {
      const recipe = findRecipe(id);
      return { id: recipe.id, title: recipe.title, ingredients: recipe.ingredients };
    },
    add_recipe_to_shopping_list: ({ recipeId }) => {
      const recipe = findRecipe(recipeId);
      for (const ingredient of recipe.ingredients) addItem(ingredient);
      return { added: recipe.ingredients.length };
    },
    place_grocery_order: ({ store }) => {
      if (store !== "corner" && store !== "market") throw new PantryError("store must be corner or market.");
      const order = { id: `o${state.orders.length + 1}`, store, items: state.items.filter((item) => !item.checked).map(({ id }) => id) };
      state.orders.push(order);
      return {};
    },
  };
  return { state, handlers };
}
