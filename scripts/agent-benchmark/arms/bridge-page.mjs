/* global document, CSS, setTimeout, window, sessionStorage */
// The bridge arm's page side, evaluated in the screen: it finds the controls a person sees and works them the way
// Vercel UI SDK's `createAgent` does (snapshot by ref, label and row; steps by ref or label; an ambiguous label refuses;
// `data-agent-confirm` needs the person). Written for this benchmark; it borrows the shape and takes no code.
function installBridge() {
  // Refs last while the tab does: a control that comes back after a page load with the same kind, label and row
  // keeps its ref, as the UI SDK's do for a returning component.
  const store = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("__pantryBridgeRefs") ?? "null") ?? { next: 1, byKey: {} };
    } catch {
      return { next: 1, byKey: {} };
    }
  })();
  const save = () => sessionStorage.setItem("__pantryBridgeRefs", JSON.stringify(store));
  const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
  const kindOf = (el) => {
    if (el.tagName === "A") return "link";
    if (el.tagName === "BUTTON") return "button";
    if (el.tagName === "SELECT") return "select";
    if (el.type === "checkbox") return "checkbox";
    if (el.type === "number") return "number";
    return "textbox";
  };
  const labelOf = (el) => {
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return text(label);
    }
    return text(el);
  };
  const rowOf = (el) => {
    const row = el.closest("li");
    return row ? text(row) : undefined;
  };
  const controls = () => [...document.querySelectorAll("a[href], button, input:not([type=hidden]), select")].filter((el) => !el.closest("[inert], [data-agent-hidden]"));
  const keyOf = (el) => [kindOf(el), labelOf(el), rowOf(el) ?? ""].join("\u0000");
  const refOf = (el) => {
    const key = keyOf(el);
    if (!store.byKey[key]) {
      store.byKey[key] = `c${store.next++}`;
      save();
    }
    return store.byKey[key];
  };
  const byRef = (ref) => controls().find((el) => store.byKey[keyOf(el)] === ref);
  const describe = (el) => {
    const kind = kindOf(el);
    const entry = { ref: refOf(el), component: kind, label: labelOf(el) };
    const row = rowOf(el);
    if (row && row !== entry.label) entry.row = row;
    if (kind === "checkbox") entry.checked = el.checked;
    if (kind === "textbox" || kind === "number") entry.value = el.value;
    if (kind === "select") {
      entry.value = el.value;
      entry.items = [...el.options].map((option) => ({ value: option.value, label: text(option) }));
    }
    if (el.dataset.agentConfirm) entry.confirm = el.dataset.agentConfirm;
    entry.actions = kind === "checkbox" ? ["setChecked"] : kind === "select" ? ["select"] : kind === "button" || kind === "link" ? ["press"] : ["setValue"];
    return entry;
  };
  const words = (value) => String(value).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
  const fits = (el, target) => {
    const want = words(target);
    if (!want.length) return false;
    const label = words(labelOf(el)).join(" ");
    const row = words(rowOf(el) ?? "").join(" ");
    const phrase = want.join(" ");
    const has = (hay) => ` ${hay} `.includes(` ${phrase} `);
    return has(label) || has(row);
  };
  const resolve = (target, action) => {
    if (/^c\d+$/.test(String(target))) {
      const el = byRef(String(target));
      return el ? { el } : { error: `${target} is not on this page. Take a snapshot for the refs.` };
    }
    const all = controls();
    let found = all.filter((el) => fits(el, target));
    if (found.length > 1) found = found.filter((el) => describe(el).actions.includes(action));
    if (found.length === 1) return { el: found[0] };
    if (!found.length) return { error: `No component matches "${target}". Take a snapshot for the refs.` };
    return { error: `"${target}" matches ${found.length} components (${found.map((el) => refOf(el)).join(", ")}); name one by its ref.` };
  };
  const optionFor = (el, value) => [...el.options].find((o) => o.value === String(value)) ?? [...el.options].find((o) => words(o.textContent).join(" ") === words(value).join(" "));
  // The page's own words beside its controls: its title, any status or error message, and list rows with no control,
  // as the UI SDK's snapshot carries a component's text parts.
  const pageText = () => {
    const read = { title: text1("h1") };
    const messages = [...document.querySelectorAll("[role=status], [role=alert]")].map(text).filter(Boolean);
    if (messages.length) read.messages = messages;
    const rows = [...document.querySelectorAll("li")].filter((li) => !li.querySelector("a[href], button, input, select")).map(text).filter(Boolean);
    if (rows.length) read.rows = rows;
    return read;
  };
  const text1 = (selector) => text(document.querySelector(selector));
  const plan = (step) => {
    const { target, action } = step ?? {};
    if (!target || !action) return { ok: false, message: "A step needs a target and an action." };
    const { el, error } = resolve(target, action);
    if (error) return { ok: false, message: error };
    const entry = describe(el);
    if (!entry.actions.includes(action)) return { ok: false, message: `${entry.ref} (${entry.component} "${entry.label}") takes ${entry.actions.join(", ")}, not ${action}.` };
    const confirm = el.closest("[data-agent-confirm]")?.dataset.agentConfirm;
    if (confirm && action === "press") return { ok: false, needsPerson: true, message: `Needs a person: "${confirm}". Ask them to press "${entry.label}" themselves.` };
    if (action === "select") {
      const option = optionFor(el, step.value);
      if (!option) return { ok: false, message: `${entry.ref} (select "${entry.label}") has no option ${JSON.stringify(step.value)}. Its options: ${entry.items.map((i) => i.label).join(", ")}.` };
    }
    if (action === "press" && el.form && el.type !== "button" && !el.form.checkValidity()) {
      const invalid = [...el.form.elements].filter((field) => field.willValidate && !field.checkValidity());
      return { ok: false, message: `The form was not sent: ${invalid.map((field) => `${labelOf(field)}: ${field.validationMessage}`).join("; ")}` };
    }
    const navigates = action === "press" || (action === "setChecked" && Boolean(el.form) && el.checked !== (step.value === true || step.value === "true"));
    return { ok: true, ref: entry.ref, navigates };
  };
  const run = (step) => {
    const { el } = resolve(step.target, step.action);
    if (step.action === "setValue") el.value = String(step.value ?? "");
    else if (step.action === "select") {
      const option = optionFor(el, step.value);
      if (option) el.value = option.value;
    } else if (step.action === "setChecked") {
      const want = step.value === true || step.value === "true";
      if (el.checked !== want) setTimeout(() => el.click(), 0);
    } else if (step.action === "press") setTimeout(() => el.click(), 0);
    return true;
  };
  window.__pantryBridge = { snapshot: () => controls().map(describe), text: pageText, plan, run };
}

/** The script the arm evaluates in each page it opens. */
export const BRIDGE_SOURCE = `(${installBridge.toString()})()`;
