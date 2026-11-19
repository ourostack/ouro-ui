import assert from "node:assert/strict";
import { test } from "node:test";

const core = await import("../registry/ouro/lib/ouro/a2ui-core.ts");
const { actionButtonProps, agentPressProblem, loadCatalog, personPress, validateTree, validateMessages } = core;

const field = (label) => ({ label, kind: "string", optional: false });
const refusal = {
  ax: "outcome/1",
  action: "order_ingredients",
  state: "refused",
  summary: "You can't order ingredients; only the person can.",
  error: { code: "person-only", exit: 77, thing: "order_ingredients", problem: "Only the person can do this.", fix: null, message: "Only the person can do this." },
};
const catalog = loadCatalog({
  catalogId: "https://example.com/a2ui/catalog.json",
  components: Object.fromEntries(["Card", "Stack", "Text", "ActionButton"].map((name) => [name, {}])),
  metadata: {
    extensions: {
      bot_ouroboros_hx: {
        actions: {
          save_note: { consent: "write", press: "run", label: "Save note", description: "Save the note.", input: { note: field("Note") } },
          share_recipe: { consent: "consequential", press: "confirm", label: "Share recipe", description: "Send this recipe to someone.", input: { with: field("With") } },
          order_ingredients: { consent: "person-only", press: "handoff", label: "Order ingredients", description: "Order the ingredients.", input: {}, personOnly: { how: "with Order ingredients in the app", refusal } },
        },
      },
    },
  },
});

const button = (action, input, props = {}) => ({ id: "go", component: "ActionButton", props: { ...actionButtonProps(catalog, action, input), emphasis: "primary", ...props }, children: [] });
const card = (...children) => ({ id: "root", component: "Card", props: {}, children });
const problems = (...children) => validateTree(catalog, card(...children));

test("a tree built from the catalog passes, whatever its consent class", () => {
  assert.deepEqual(problems(button("save_note", { note: "n" }), button("share_recipe", { with: "sam@example.com" }), button("order_ingredients", {})), []);
});

test("an agent can't loosen a consequential action's consent, press or confirm sheet in the tree it sends", () => {
  const share = { with: "sam@example.com" };
  const loosened = problems(button("share_recipe", share, { consent: "write" }));
  assert.ok(loosened.some((p) => p.path === "/children/0/props/consent" && /never the sender's/.test(p.message)), JSON.stringify(loosened));
  assert.ok(problems(button("share_recipe", share, { press: "run" })).some((p) => p.path === "/children/0/props/press"));
  const bare = button("share_recipe", share);
  delete bare.props.confirm;
  assert.ok(problems(bare).some((p) => p.path === "/children/0/props/confirm"));
  const forged = button("share_recipe", share);
  forged.props.confirm = { ...forged.props.confirm, description: "Nothing leaves this device." };
  assert.ok(problems(forged).some((p) => p.path === "/children/0/props/confirm"));
});

test("an agent can't relabel a button, or give a write action a confirm sheet it never asked for", () => {
  assert.ok(problems(button("save_note", { note: "n" }, { label: "Delete everything" })).some((p) => p.path === "/children/0/props/label"));
  const decorated = button("save_note", { note: "n" });
  decorated.props.confirm = { title: "Save note", description: "Save the note.", fields: [] };
  assert.ok(problems(decorated).some((p) => p.path === "/children/0/props/confirm" && /only a consequential action does/.test(p.message)));
});

test("an agent can't turn a person-only action into one it may press, or send it input", () => {
  assert.ok(problems(button("order_ingredients", {}, { consent: "write", press: "run" })).some((p) => p.path === "/children/0/props/consent"));
  const withInput = button("order_ingredients", {});
  withInput.props.input = { address: "1 Main St" };
  const found = problems(withInput).find((p) => p.path === "/children/0/props/input");
  assert.equal(found?.refusal?.error.code, "person-only", "the problem carries the typed refusal");
});

test("an action the catalog doesn't declare is refused, including names that exist on every object", () => {
  for (const action of ["delete_account", "__proto__", "constructor", "toString"]) {
    assert.ok(problems({ id: "go", component: "ActionButton", props: { action, label: "Go", consent: "write", press: "run", input: {} }, children: [] }).some((p) => p.path === "/children/0/props/action"), action);
  }
});

test("a button's press needs the person: a consequential one only after they confirm, a person-only one never", () => {
  const share = button("share_recipe", { with: "sam@example.com" });
  assert.throws(() => personPress(share), /consequential; send its action only after the person confirms/);
  assert.throws(() => personPress(share, false), /only after the person confirms/);
  assert.equal(personPress(share, true).by, "person");
  assert.throws(() => personPress(button("order_ingredients", {}), true), /person-only; its button hands the person to the app, so it sends no action/);
  assert.equal(personPress(button("save_note", { note: "n" })).consent, "write");
});

test("an agent that tries to press through the person's screen is sent to its own door, and a person-only action answers with the typed refusal", () => {
  const person = agentPressProblem(catalog, "order_ingredients");
  assert.equal(person.refusal?.error.code, "person-only");
  assert.equal(person.refusal?.state, "refused");
  assert.match(agentPressProblem(catalog, "share_recipe").message, /agents run actions through their own tool/);
  assert.match(agentPressProblem(catalog, "nothing").message, /no functions an agent may call/);
  const call = validateMessages(
    { catalogId: catalog.catalogId, components: Object.fromEntries(Object.keys(catalog.components).map((name) => [name, {}])), metadata: { extensions: { bot_ouroboros_hx: { actions: Object.fromEntries(Object.entries(catalog.actions)) } } } },
    [{ version: "1.0", callRendererFunction: { surfaceId: "s", functionCallId: "f1", call: "order_ingredients", args: {} } }],
  );
  assert.ok(call.every((p) => p.code === "INVALID_FUNCTION_CALL" || p.code === "VALIDATION_FAILED"), JSON.stringify(call));
  assert.ok(call.length > 0, "a callRendererFunction for any action is a problem");
});
