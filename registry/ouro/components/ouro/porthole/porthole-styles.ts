import { defineComponentAx } from "@/registry/ouro/ax/component";
import type { PortholeState } from "@/registry/ouro/lib/ouro/porthole-view";

const PERSON_ONLY = "You can't change what the status spot shows; only the person opens or dismisses it.";

/**
 * Porthole's agent side: one read, `status`, the JSON `portholeStatus` gives, and Porthole's own actions (expand,
 * collapse and dismiss), each person-only. An agent reads the status spot; it never adds, removes or changes what it
 * shows. The shown item's action belongs to the service, not to Porthole: its button carries the item action's id
 * (`data-ax-action="restart"`), so the app declares that action, person-only, in its own agent side. Bind the read to
 * the app's status command with `bindAx`, and name in `refuseAs` the words an agent might try for the actions.
 *
 * @example
 * const ui = bindAx(portholeAx, {
 *   reads: { status: "app status --json" },
 *   refuseAs: { expand: "app status open", collapse: "app status close", dismiss: "app status dismiss" },
 * });
 * @claim "collapse and dismiss), each person-only" registry/ouro/components/ouro/porthole/porthole.test.tsx verify:testExists(registry/ouro/components/ouro/porthole/porthole.test.tsx::Porthole agent side > declares one status read and only person-only actions, each rendered on its control)
 * @claim "it never adds, removes or" registry/ouro/components/ouro/porthole/porthole.test.tsx verify:testExists(registry/ouro/components/ouro/porthole/porthole.test.tsx::Porthole agent side > declares one status read and only person-only actions, each rendered on its control)
 */
export const portholeAx = defineComponentAx({
  component: "Porthole",
  reads: [
    {
      id: "status",
      summary: "What the status spot shows and why: its state, the line shown, whether the data is fresh and the service alive, and each area's age.",
      fields: ["asOf", "state", "headline", "fresh", "alive", "heartbeatAt", "heartbeatAgeMs", "areas", "priority", "shown"],
      consent: "none",
    },
  ],
  actions: [
    { id: "expand", summary: "Open the status spot's detail lines.", effect: "private", personOnly: PERSON_ONLY },
    { id: "collapse", summary: "Close the status spot's detail lines.", effect: "private", personOnly: PERSON_ONLY },
    { id: "dismiss", summary: "Dismiss news the person has seen, such as Up to date.", effect: "private", personOnly: PERSON_ONLY },
  ],
});

/**
 * The colour of the spot's light, by state. Forced colours drop fills and box shadows, so the light is drawn in
 * CanvasText there (the base class in porthole.tsx), unknown as an empty outlined circle, and an action in Highlight
 * with an outlined halo.
 */
export const portholeLightClasses: Readonly<Record<PortholeState, string>> = {
  "rest-fresh": "bg-[color-mix(in_oklab,var(--success)_85%,var(--foreground))]",
  "rest-stale": "bg-[color-mix(in_oklab,var(--muted-foreground)_85%,var(--foreground))]",
  unknown:
    "bg-transparent ring-[1.5px] ring-[color-mix(in_oklab,var(--muted-foreground)_85%,var(--foreground))] ring-inset forced-colors:bg-[Canvas] forced-colors:outline-[1.5px] forced-colors:-outline-offset-[1.5px] forced-colors:outline-solid forced-colors:outline-[CanvasText]",
  working: "bg-[color-mix(in_oklab,var(--primary)_85%,var(--foreground))]",
  error: "bg-[color-mix(in_oklab,var(--destructive)_85%,var(--foreground))]",
  // A halo around the dot, so "something to press" differs from working by shape, not colour alone.
  action:
    "bg-[color-mix(in_oklab,var(--primary)_85%,var(--foreground))] ring-2 ring-[color-mix(in_oklab,var(--primary)_40%,transparent)] ring-offset-1 ring-offset-card forced-colors:bg-[Highlight] forced-colors:outline-2 forced-colors:outline-offset-1 forced-colors:outline-solid forced-colors:outline-[Highlight]",
};

/** Where the open lines show: under the spot, or over it. */
export type PortholeSide = "bottom" | "top";

/** How long a mouse rests on the spot before its lines open, in ms, so passing over it opens nothing. */
export const PORTHOLE_HOVER_DELAY_MS = 300;

/** How long after one spoken change the next may be spoken, in ms. */
export const PORTHOLE_ANNOUNCE_GAP_MS = 10_000;
