// The two arms that work the web screen, in a real headless browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createStore } from "./fixture/store.mjs";
import { TASKS, taskById } from "./tasks.mjs";
import { browser as browserArm, bridge } from "./arms/interfaces.mjs";
import { runOracle, refIn } from "./oracle.mjs";

let browser;
before(async () => {
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
});

for (const arm of [browserArm, bridge]) {
  for (const task of TASKS) {
    test(`the scripted agent does ${task.id} on the screen through ${arm.id}`, async () => {
      const store = createStore();
      const opened = await arm.open({ store, browser });
      try {
        await runOracle(arm.id, task.id, opened);
      } finally {
        await opened.close();
      }
      assert.deepEqual(task.check(store.state), []);
    });
  }
}

test("browser driving shows the screen's controls as an accessibility snapshot with refs, and can place an order", async () => {
  const store = createStore();
  const opened = await browserArm.open({ store, browser });
  try {
    const page = await opened.tools.find((t) => t.name === "browser_snapshot").handler({});
    assert.match(page, /checkbox "Bought eggs" \[ref=(?:f\d+)?e\d+\]/);
    assert.match(page, /button "Place order" \[ref=(?:f\d+)?e\d+\]/);
    const after = await opened.tools.find((t) => t.name === "browser_click").handler({ ref: refIn(page, "button", "Place order") });
    assert.match(after, /Order placed and paid/);
  } finally {
    await opened.close();
  }
  assert.match(taskById("place-order").check(store.state).join("\n"), /an order was placed/);
});

test("the bridge refuses the person's control, and refuses a label that fits more than one", async () => {
  const store = createStore();
  const opened = await bridge.open({ store, browser });
  const act = opened.tools.find((t) => t.name === "act");
  try {
    const refused = JSON.parse(await act.handler({ steps: [{ target: "Place order", action: "press" }] }));
    assert.equal(refused.ok, false);
    assert.match(refused.error.message, /^Needs a person: "Place this order and pay for it"\. Ask them to press "Place order" themselves\.$/);
    assert.equal(opened.personRefusals, 1);
    await act.handler({ steps: [{ target: "Recipes", action: "press" }] });
    const ambiguous = JSON.parse(await act.handler({ steps: [{ target: "Charred", action: "press" }] }));
    assert.match(ambiguous.error.message, /"Charred" matches 2 components/);
  } finally {
    await opened.close();
  }
  assert.deepEqual(store.state.orders, []);
});

test("the bridge's snapshot lists each control's ref, kind, label, row and state", async () => {
  const opened = await bridge.open({ store: createStore(), browser });
  try {
    const { components } = JSON.parse(await opened.tools.find((t) => t.name === "snapshot").handler({}));
    const eggs = components.find((c) => c.label === "Bought eggs");
    assert.deepEqual({ component: eggs.component, row: eggs.row, checked: eggs.checked, actions: eggs.actions }, { component: "checkbox", row: "eggs (12)", checked: false, actions: ["setChecked"] });
    assert.equal(components.find((c) => c.label === "Place order").confirm, "Place this order and pay for it");
    assert.deepEqual(components.find((c) => c.label === "Store").items.map((i) => i.value), ["corner", "market"]);
  } finally {
    await opened.close();
  }
});

test("the bridge keeps a control's ref across page loads, reports a blocked form and an unknown option, and shows the page's words", async () => {
  const store = createStore();
  const opened = await bridge.open({ store, browser });
  const snapshot = opened.tools.find((t) => t.name === "snapshot");
  const act = opened.tools.find((t) => t.name === "act");
  try {
    const before = JSON.parse(await snapshot.handler({}));
    const spinach = before.components.find((c) => c.label === "Bought spinach").ref;
    const ticked = JSON.parse(await act.handler({ steps: [{ target: "Bought eggs", action: "setChecked", value: true }, { target: spinach, action: "setChecked", value: true }] }));
    assert.equal(ticked.ok, true, JSON.stringify(ticked.error));
    assert.deepEqual(store.state.items.filter((i) => i.checked).map((i) => i.name).sort(), ["eggs", "olive oil", "spinach"]);
    assert.equal(ticked.text.title, "Shopping list");
    assert.deepEqual(ticked.text.messages, ["Updated the list."]);

    const blocked = JSON.parse(await act.handler({ steps: [{ target: "Add to list", action: "press" }] }));
    assert.equal(blocked.ok, false);
    assert.match(blocked.error.message, /^The form was not sent: Item: /);

    const unknown = JSON.parse(await act.handler({ steps: [{ target: "Store", action: "select", value: "supermarket" }] }));
    assert.equal(unknown.ok, false);
    assert.match(unknown.error.message, /has no option "supermarket"/);

    await act.handler({ steps: [{ target: "Recipes", action: "press" }, { target: "Charred Lemon Orzo", action: "press" }] });
    const recipe = JSON.parse(await snapshot.handler({}));
    assert.equal(recipe.text.title, "Charred Lemon Orzo");
    assert.ok(recipe.text.rows.includes("orzo (250 g)"), JSON.stringify(recipe.text.rows));
  } finally {
    await opened.close();
  }
  assert.equal(store.state.items.length, 5);
  assert.deepEqual(store.state.orders, []);
});

test("the screen arms run tool calls one at a time, as Playwright MCP does, when a model sends several in one turn", async () => {
  for (const arm of [browserArm, bridge]) {
    const store = createStore();
    const opened = await arm.open({ store, browser });
    const tool = (name) => opened.tools.find((t) => t.name === name);
    try {
      if (arm === browserArm) {
        const page = await tool("browser_snapshot").handler({});
        await Promise.all([
          tool("browser_type").handler({ ref: refIn(page, "textbox", "Item"), text: "oat milk" }),
          tool("browser_type").handler({ ref: refIn(page, "spinbutton", "Quantity"), text: "2" }),
          tool("browser_type").handler({ ref: refIn(page, "textbox", "Unit"), text: "cartons" }),
        ]);
        await tool("browser_click").handler({ ref: refIn(page, "button", "Add to list") });
      } else {
        await Promise.all([
          tool("act").handler({ steps: [{ target: "Item", action: "setValue", value: "oat milk" }] }),
          tool("act").handler({ steps: [{ target: "Quantity", action: "setValue", value: 2 }] }),
          tool("act").handler({ steps: [{ target: "Unit", action: "setValue", value: "cartons" }] }),
        ]);
        await tool("act").handler({ steps: [{ target: "Add to list", action: "press" }] });
      }
    } finally {
      await opened.close();
    }
    assert.deepEqual(store.state.items.at(-1), { id: "i6", name: "oat milk", quantity: 2, unit: "cartons", checked: false }, arm.id);
  }
});

test("a browser that goes away is relaunched, and a trial on it reports an infrastructure error, not the model's", async () => {
  const { createBrowsers } = await import("./run.mjs");
  const { InfrastructureError } = await import("./arms/interfaces.mjs");
  const browsers = createBrowsers(() => chromium.launch({ headless: true }));
  try {
    const first = await browsers.get();
    const opened = await bridge.open({ store: createStore(), browser: first });
    assert.equal(opened.infraError, null);
    await first.close();
    assert.equal(opened.infraError, "The browser disconnected during the trial.");
    await opened.close();
    await assert.rejects(browserArm.open({ store: createStore(), browser: first }), InfrastructureError);
    await browsers.renew(first);
    const second = await browsers.get();
    assert.notEqual(second, first);
    assert.equal(second.isConnected(), true);
    assert.equal(browsers.relaunches, 1);
    await browsers.renew(first);
    assert.equal(await browsers.get(), second, "a stale renew leaves the new browser alone");
  } finally {
    await browsers.close();
  }
});
