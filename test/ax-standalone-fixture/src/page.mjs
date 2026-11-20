import { controls } from "../generated/web.ts";
import { handlers } from "./tasks.mjs";

const attrs = (props) => Object.entries(props).map(([k, v]) => `${k}="${v}"`).join(" ");

// The app's existing screen. Each button keeps its own markup and handler; spreading a control's props marks it as the
// button for that action, and the click calls the same handler the MCP tool calls.
export function render() {
  const { tasks } = handlers.list_tasks({});
  return `<main><ul>${JSON.parse(tasks).map((t) => `<li>${t.title}${t.done ? " (done)" : ""}</li>`).join("")}</ul>
<button ${attrs(controls["list-tasks"].props)}>${controls["list-tasks"].label}</button>
<button ${attrs(controls["complete-task"].props)}>${controls["complete-task"].label}</button></main>`;
}

export const press = (action, input = {}) => handlers[action.replaceAll("-", "_")](input);
