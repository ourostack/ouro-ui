import { controls } from "../generated/web.ts";
import { handlers } from "./tasks.mjs";

const attrs = (props) => Object.entries(props).map(([k, v]) => `${k}="${v}"`).join(" ");

// The app's existing screen. Each button keeps its own markup and click handler; spreading a control's props marks it as
// the button for that action, and its click calls the same handler the MCP tool calls.
const buttons = {
  "list-tasks": { onClick: (input) => handlers.list_tasks(input) },
  "complete-task": { onClick: (input) => handlers.complete_task(input) },
};

export function render() {
  const { tasks } = handlers.list_tasks({});
  const buttonHtml = Object.keys(buttons).map((action) => `<button ${attrs(controls[action].props)}>${controls[action].label}</button>`).join("\n");
  return `<main><ul>${JSON.parse(tasks).map((t) => `<li>${t.title}${t.done ? " (done)" : ""}</li>`).join("")}</ul>\n${buttonHtml}</main>`;
}

// A click on the rendered button bound to this action.
export function press(action, input = {}) {
  if (!new RegExp(`data-ax-action="${action}"`).test(render())) throw new Error(`no button is bound to ${action}`);
  return buttons[action].onClick(input);
}
