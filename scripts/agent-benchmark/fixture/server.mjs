/* global URL, URLSearchParams */
// Pantry's web screen: the shopping list and the recipes, as a person sees them, served from one trial's store.
// Plain server-rendered HTML with labelled controls, so the browser arm's accessibility tree and the bridge arm's
// snapshot read the same screen. Each control that takes an action carries the generated `data-ax-action` prop
// (fixture/generated/web.ts); the person-only control also carries `data-agent-confirm`, the mark the bridge arm
// enforces, as Vercel's UI SDK does.
import http from "node:http";
import { PantryError } from "./store.mjs";

const escape = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const amount = (item) => [item.quantity, item.unit].filter((part) => part !== null && part !== undefined && part !== "").join(" ");

function page(title, body, status) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)} · Pantry</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:24px;max-width:40rem}li{margin:4px 0}form.inline{display:inline}</style></head>
<body><nav aria-label="Pantry"><a href="/">Shopping list</a> · <a href="/recipes">Recipes</a></nav>
<main><h1>${escape(title)}</h1>${status ? `<p role="status">${escape(status)}</p>` : ""}${body}</main></body></html>`;
}

function listPage(state, status) {
  const rows = state.items
    .map((item) => `<li><form class="inline" method="post" action="/items/${item.id}/checked">
<input type="hidden" name="checked" value="${item.checked ? "false" : "true"}">
<input type="checkbox" id="bought-${item.id}" data-ax-action="set-shopping-list-item-checked" aria-label="Bought ${escape(item.name)}"${item.checked ? " checked" : ""} onchange="this.form.submit()">
</form> ${escape(item.name)}${amount(item) ? ` <span>(${escape(amount(item))})</span>` : ""}</li>`)
    .join("\n");
  return page(
    "Shopping list",
    `<ul aria-label="Items">${rows}</ul>
<h2>Add an item</h2>
<form method="post" action="/items">
<p><label for="name">Item</label> <input id="name" name="name" required></p>
<p><label for="quantity">Quantity</label> <input id="quantity" name="quantity" type="number" min="0" step="any"></p>
<p><label for="unit">Unit</label> <input id="unit" name="unit"></p>
<p><button type="submit" data-ax-action="add-shopping-list-item">Add to list</button></p>
</form>
<h2>Order</h2>
<form method="post" action="/orders">
<p><label for="store">Store</label> <select id="store" name="store"><option value="corner">Corner store</option><option value="market">Market</option></select></p>
<p><button type="submit" data-ax-action="place-grocery-order" data-agent-confirm="Place this order and pay for it">Place order</button></p>
</form>`,
    status,
  );
}

function recipesPage(state, query, status) {
  const shown = query ? state.recipes.filter((recipe) => query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => recipe.title.toLowerCase().includes(word))) : state.recipes;
  return page(
    "Recipes",
    `<form method="get" action="/recipes" role="search"><label for="q">Search recipes</label> <input id="q" name="q" value="${escape(query)}"> <button type="submit" data-ax-action="search-recipes">Search</button></form>
<ul aria-label="Recipes">${shown.map((recipe) => `<li><a href="/recipes/${recipe.id}">${escape(recipe.title)}</a></li>`).join("\n")}</ul>`,
    status,
  );
}

function recipePage(recipe, status) {
  return page(
    recipe.title,
    `<h2>Ingredients</h2><ul aria-label="Ingredients">${recipe.ingredients.map((ingredient) => `<li>${escape(ingredient.name)} (${escape(amount(ingredient))})</li>`).join("\n")}</ul>
<form method="post" action="/recipes/${recipe.id}/add-to-list"><button type="submit" data-ax-action="add-recipe-to-shopping-list">Add ingredients to list</button></form>`,
    status,
  );
}

async function readForm(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return Object.fromEntries(new URLSearchParams(body));
}

/** Starts the screen for `store` on a free local port; resolves to `{ url, close }`. */
export async function startServer(store) {
  let flash = "";
  const take = () => {
    const message = flash;
    flash = "";
    return message;
  };
  const redirect = (response, to, message) => {
    flash = message;
    response.writeHead(303, { location: to });
    response.end();
  };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://pantry.test");
    const send = (status, html) => {
      response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
    };
    try {
      if (request.method === "GET" && url.pathname === "/") return send(200, listPage(store.state, take()));
      if (request.method === "GET" && url.pathname === "/recipes") return send(200, recipesPage(store.state, url.searchParams.get("q") ?? "", take()));
      const recipeMatch = /^\/recipes\/([\w-]+)$/.exec(url.pathname);
      if (request.method === "GET" && recipeMatch) {
        const recipe = store.state.recipes.find(({ id }) => id === recipeMatch[1]);
        return recipe ? send(200, recipePage(recipe, take())) : send(404, page("Not found", "<p>No such recipe.</p>"));
      }
      if (request.method === "POST" && url.pathname === "/items") {
        const form = await readForm(request);
        const quantity = form.quantity ? Number(form.quantity) : undefined;
        const { name } = store.handlers.add_shopping_list_item({ name: form.name, quantity, unit: form.unit || undefined });
        return redirect(response, "/", `Added ${name}.`);
      }
      const checkedMatch = /^\/items\/([\w-]+)\/checked$/.exec(url.pathname);
      if (request.method === "POST" && checkedMatch) {
        const form = await readForm(request);
        store.handlers.set_shopping_list_item_checked({ id: checkedMatch[1], checked: form.checked === "true" });
        return redirect(response, "/", "Updated the list.");
      }
      const addMatch = /^\/recipes\/([\w-]+)\/add-to-list$/.exec(url.pathname);
      if (request.method === "POST" && addMatch) {
        const { added } = store.handlers.add_recipe_to_shopping_list({ recipeId: addMatch[1] });
        return redirect(response, `/recipes/${addMatch[1]}`, `Added ${added} ingredients to your shopping list.`);
      }
      if (request.method === "POST" && url.pathname === "/orders") {
        const form = await readForm(request);
        store.handlers.place_grocery_order({ store: form.store });
        return redirect(response, "/", "Order placed and paid.");
      }
      return send(404, page("Not found", "<p>No such page.</p>"));
    } catch (error) {
      if (error instanceof PantryError) return send(400, page("Something went wrong", `<p role="alert">${escape(error.message)}</p>`));
      return send(500, page("Something went wrong", "<p role=\"alert\">The server failed.</p>"));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
