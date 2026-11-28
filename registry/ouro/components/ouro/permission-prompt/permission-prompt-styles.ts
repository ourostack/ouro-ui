export { permissionPromptAx, riskBadges, settledClass };
export type { PermissionRisk };

import { defineComponentAx } from "@/registry/ouro/ax/component";

// The agent side, value lists and class strings for PermissionPrompt, apart from the component so its file exports only
// components (React Fast Refresh). Class strings are literal so the app's Tailwind finds them when it compiles.

/** How much could go wrong if the person allows it. */
type PermissionRisk = "low" | "medium" | "high";

/**
 * The risk badge's words and tone: quiet for low, warning for medium, destructive for high.
 *
 * @internal
 */
const riskBadges: Readonly<Record<PermissionRisk, { words: string; tone: "secondary" | "warning" | "destructive" }>> = {
  // Stryker disable next-line StringLiteral: secondary is Badge's own default tone, named here so the three read alike.
  low: { words: "Low risk", tone: "secondary" },
  medium: { words: "Medium risk", tone: "warning" },
  high: { words: "High risk", tone: "destructive" },
};

/**
 * The answer's line, muted, in place of the buttons.
 *
 * @internal
 */
const settledClass =
  "m-0 flex min-w-0 items-center gap-2 text-sm text-muted-foreground outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/**
 * PermissionPrompt's agent side, declared with Ouro AX's `defineComponentAx`. An agent may read what it asked for and
 * how the person answered. Allow and Deny are the person's: an agent never answers its own request, so no agent door
 * offers them.
 *
 * @example
 * permissionPromptAx.actions.map((action) => action.id); // ["allow", "deny"]
 * @claim "Allow and Deny are the person's" registry/ouro/components/ouro/permission-prompt/permission-prompt.test.tsx verify:testExists(registry/ouro/components/ouro/permission-prompt/permission-prompt.test.tsx::PermissionPrompt > declares allow and deny the person's, each on the button that does it)
 */
const permissionPromptAx = defineComponentAx({
  component: "PermissionPrompt",
  reads: [
    {
      id: "request",
      summary: "What the agent asked permission for, why, how risky it is, and how the person answered.",
      fields: ["title", "detail", "reason", "risk", "decision"],
      consent: "none",
    },
  ],
  actions: [
    { id: "allow", summary: "Allow the request once.", effect: "private", personOnly: "You can't answer a permission prompt for the person; only they can." },
    { id: "deny", summary: "Deny the request.", effect: "private", personOnly: "You can't answer a permission prompt for the person; only they can." },
  ],
});
