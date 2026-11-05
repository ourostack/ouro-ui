import "../../app.css";
import { historyPrepend } from "./cases/history-prepend";

// The page every Ouro Feel host opens: it defines the cases, and the host's probe runs them
// (`window.ouroFeel.run(name)`). It renders nothing until a case does.
window.ouroFeelCases = { "history-prepend": historyPrepend };
document.documentElement.style.cssText = "height: 100%; background: var(--background); color: var(--foreground)";
document.body.style.cssText = "height: 100%; margin: 0; font-family: system-ui, sans-serif";
