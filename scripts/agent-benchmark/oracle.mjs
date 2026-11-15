// A scripted agent for each arm and task: a short, plain path through the arm's own tools. It proves every task can
// be done through every arm, and gives a reference step count per arm; it is not a proven minimum (a path that reads
// the list first can skip ingredients already on it, for one). No model is called.

/** The ref of the first `role "name"` line in a Playwright AI snapshot. */
export function refIn(snapshot, role, name) {
  const pattern = new RegExp(`- ${role} "${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^\\n]*\\[ref=((?:f\\d+)?e\\d+)\\]`);
  const match = pattern.exec(snapshot);
  if (!match) throw new Error(`No ${role} "${name}" in the snapshot.`);
  return match[1];
}

const policies = {
  "action-model": {
    "add-item": async (call) => {
      await call("add_shopping_list_item", { name: "oat milk", quantity: 2, unit: "cartons" });
    },
    "recipe-to-list": async (call) => {
      const { recipes } = JSON.parse(await call("search_recipes", { query: "charred lemon orzo" }));
      await call("add_recipe_to_shopping_list", { recipeId: JSON.parse(recipes)[0].id });
    },
    "check-off": async (call) => {
      const items = JSON.parse(JSON.parse(await call("get_shopping_list", {})).items);
      for (const name of ["eggs", "spinach"]) await call("set_shopping_list_item_checked", { id: items.find((item) => item.name === name).id, checked: true });
    },
  },
  "plain-mcp": {
    "add-item": async (call) => {
      await call("add_item", { name: "oat milk", quantity: 2, unit: "cartons" });
    },
    "recipe-to-list": async (call) => {
      const { recipes } = JSON.parse(await call("search_recipes", { q: "charred lemon orzo" }));
      const recipe = JSON.parse(await call("get_recipe", { id: JSON.parse(recipes)[0].id }));
      for (const ingredient of recipe.ingredients) await call("add_item", { name: ingredient.name, quantity: ingredient.quantity, ...(ingredient.unit ? { unit: ingredient.unit } : {}) });
    },
    "check-off": async (call) => {
      const items = JSON.parse(JSON.parse(await call("list_items", {})).items);
      for (const name of ["eggs", "spinach"]) await call("update_item", { id: items.find((item) => item.name === name).id, checked: true });
    },
  },
  browser: {
    "add-item": async (call) => {
      const page = await call("browser_snapshot", {});
      await call("browser_type", { ref: refIn(page, "textbox", "Item"), text: "oat milk" });
      await call("browser_type", { ref: refIn(page, "spinbutton", "Quantity"), text: "2" });
      await call("browser_type", { ref: refIn(page, "textbox", "Unit"), text: "cartons" });
      await call("browser_click", { ref: refIn(page, "button", "Add to list") });
    },
    "recipe-to-list": async (call) => {
      const list = await call("browser_snapshot", {});
      const recipes = await call("browser_click", { ref: refIn(list, "link", "Recipes") });
      const recipe = await call("browser_click", { ref: refIn(recipes, "link", "Charred Lemon Orzo") });
      await call("browser_click", { ref: refIn(recipe, "button", "Add ingredients to list") });
    },
    "check-off": async (call) => {
      const page = await call("browser_snapshot", {});
      const after = await call("browser_click", { ref: refIn(page, "checkbox", "Bought eggs") });
      await call("browser_click", { ref: refIn(after, "checkbox", "Bought spinach") });
    },
  },
  bridge: {
    "add-item": async (call) => {
      await call("act", { steps: [{ target: "Item", action: "setValue", value: "oat milk" }, { target: "Quantity", action: "setValue", value: 2 }, { target: "Unit", action: "setValue", value: "cartons" }, { target: "Add to list", action: "press" }] });
    },
    "recipe-to-list": async (call) => {
      await call("act", { steps: [{ target: "Recipes", action: "press" }, { target: "Charred Lemon Orzo", action: "press" }, { target: "Add ingredients to list", action: "press" }] });
    },
    "check-off": async (call) => {
      await call("act", { steps: [{ target: "Bought eggs", action: "setChecked", value: true }, { target: "Bought spinach", action: "setChecked", value: true }] });
    },
  },
};

/**
 * Runs the scripted agent for `armId` and `taskId` against `opened.tools`; returns the calls it made. A person-only
 * task's path is no call at all: the right move is to tell the person it is theirs to do.
 */
export async function runOracle(armId, taskId, opened) {
  const calls = [];
  const byName = new Map(opened.tools.map((tool) => [tool.name, tool]));
  const call = async (name, args) => {
    const tool = byName.get(name);
    if (!tool) throw new Error(`${armId} has no tool ${name}.`);
    const result = await tool.handler(args);
    calls.push({ name, args, result });
    return result;
  };
  const policy = policies[armId]?.[taskId];
  if (policy) await policy(call);
  else if (taskId !== "place-order") throw new Error(`No oracle for ${armId} / ${taskId}.`);
  return calls;
}
