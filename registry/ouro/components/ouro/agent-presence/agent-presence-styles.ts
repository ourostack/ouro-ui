export { agentPresenceAx, agentPresenceSizes, doingClass, unreadDotClass };

// Class strings, values and the agent side for AgentPresence, apart from the component so its
// file exports only components (React Fast Refresh). Class strings are literal so the app's
// Tailwind finds them when it compiles.

/** The chip's sizes, which are Button's. @internal */
const agentPresenceSizes = ["sm", "md", "lg"] as const;

/**
 * The unread dot: a small dot in the primary colour, CanvasText under forced colours. @internal
 * @claim "The unread dot: a small dot" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence > shows a dot when an agent left something, and says so in the chip's name)
 */
const unreadDotClass = "inline-block size-2 shrink-0 rounded-full bg-primary forced-colors:bg-[CanvasText]";

/** What an agent listens for, under its name: the muted foreground mixed toward the foreground, as on a muted surface. @internal */
const doingClass = "text-sm text-[color-mix(in_oklab,var(--muted-foreground)_80%,var(--foreground))]";

/**
 * AgentPresence's agent side, for Ouro AX's kit. Agents may read which of the person's agents
 * are listening and what each listens for. Stopping one, or all, is the person's alone: an
 * agent stops its own listening through the app's own command, not through this component.
 *
 * @example
 * agentPresenceAx.actions.map((action) => action.id); // ["stop", "stop-all"]
 * @claim "Agents may read which of the" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence agent side > declares one read and two actions only the person takes, each on a control that names it)
 * @claim "Stopping one, or all, is the" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence agent side > declares one read and two actions only the person takes, each on a control that names it)
 */
// TODO(ourostack/ouro-ui ax/component): wrap with defineComponentAx once it lands
const agentPresenceAx = {
  component: "AgentPresence",
  reads: [
    {
      id: "listening",
      summary: "Which of the person's agents are listening, and what each listens for.",
      fields: ["agent", "doing"],
      consent: "none",
    },
  ],
  actions: [
    {
      id: "stop",
      summary: "Stop an agent listening for the person.",
      effect: "private",
      personOnly: "You can't decide who listens for the person; only they can.",
    },
    {
      id: "stop-all",
      summary: "Stop every agent listening for the person.",
      effect: "private",
      personOnly: "You can't decide who listens for the person; only they can.",
    },
  ],
} as const;
