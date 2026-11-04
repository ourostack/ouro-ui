export { agentPresenceAx, agentPresenceSizes, doingClass, unreadDotClass };

// Class strings, values and the agent side for AgentPresence, apart from the component so its
// file exports only components (React Fast Refresh). Class strings are literal so the app's
// Tailwind finds them when it compiles.

import { defineComponentAx } from "@/registry/ouro/ax/component";

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
 * AgentPresence's agent side, declared with Ouro AX's `defineComponentAx`. Agents may read which
 * of the person's agents are listening and what each listens for. An agent may stop only its own
 * listening, its own row: Ouro AX has no owner scope, so the app's `stop` twin names the row
 * (such as `call unfollow --agent <me>`) and refuses any row that isn't the calling agent's.
 * Another agent's Stop and Stop all are the person's, since the person asked those agents to
 * listen. Nothing here starts listening: that stays the person's, from the app.
 *
 * @example
 * agentPresenceAx.actions.map((action) => action.id); // ["stop", "stop-all"]
 * @claim "Agents may read which of the" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence agent side > declares one read, a stop an agent takes only on its own row, and Stop all as the person's, each on a control that names it, and nothing that starts listening)
 * @claim "An agent may stop only its own" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence agent side > binds stop to a twin that names the calling agent's row, and Stop all to words that refuse)
 * @claim "Another agent's Stop and Stop all are the person's" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence agent side > declares one read, a stop an agent takes only on its own row, and Stop all as the person's, each on a control that names it, and nothing that starts listening)
 * @claim "Nothing here starts listening" registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx verify:testExists(registry/ouro/components/ouro/agent-presence/agent-presence.test.tsx::AgentPresence agent side > declares one read, a stop an agent takes only on its own row, and Stop all as the person's, each on a control that names it, and nothing that starts listening)
 */
const agentPresenceAx = defineComponentAx({
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
    { id: "stop", summary: "Stop your own listening for the person: your row only, never another agent's.", effect: "private", agent: true },
    { id: "stop-all", summary: "Stop every agent listening for the person.", effect: "private", personOnly: "You can't stop every agent; only the person can. Stop your own listening with stop." },
  ],
});
