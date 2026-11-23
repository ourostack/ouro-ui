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
    { id: "dismiss", summary: "Dismiss news the person has seen, such as Updated to version 2.4.", effect: "private", personOnly: PERSON_ONLY },
  ],
});

/**
 * The colour of the spot's light, by state. Forced colours drop fills and box shadows, so there the light is a filled
 * CanvasText dot only while the data is fresh, and a hollow ring for every other state: a CanvasText border round a
 * transparent fill, or for an action a Highlight border with an outlined Highlight halo. Fresh and stale then differ
 * by shape, not by their words alone.
 *
 * @claim "a filled CanvasText dot only" registry/ouro/components/ouro/porthole/porthole.test.tsx verify:testExists(registry/ouro/components/ouro/porthole/porthole.test.tsx::Porthole > under forced colours, fills the light only while fresh, and draws every other state as a hollow ring the same size)
 */
export const portholeLightClasses: Readonly<Record<PortholeState, string>> = {
  "rest-fresh": "bg-[color-mix(in_oklab,var(--success)_85%,var(--foreground))] forced-colors:bg-[CanvasText]",
  "rest-stale":
    "bg-[color-mix(in_oklab,var(--muted-foreground)_85%,var(--foreground))] forced-colors:box-border forced-colors:border-[1.5px] forced-colors:border-solid forced-colors:border-[CanvasText] forced-colors:bg-transparent",
  unknown:
    "bg-transparent ring-[1.5px] ring-[color-mix(in_oklab,var(--muted-foreground)_85%,var(--foreground))] ring-inset forced-colors:box-border forced-colors:border-[1.5px] forced-colors:border-solid forced-colors:border-[CanvasText]",
  working:
    "bg-[color-mix(in_oklab,var(--primary)_85%,var(--foreground))] forced-colors:box-border forced-colors:border-[1.5px] forced-colors:border-solid forced-colors:border-[CanvasText] forced-colors:bg-transparent",
  error:
    "bg-[color-mix(in_oklab,var(--destructive)_85%,var(--foreground))] forced-colors:box-border forced-colors:border-[1.5px] forced-colors:border-solid forced-colors:border-[CanvasText] forced-colors:bg-transparent",
  // A halo around the dot, so "something to press" differs from working by shape, not colour alone.
  action:
    "bg-[color-mix(in_oklab,var(--primary)_85%,var(--foreground))] ring-2 ring-[color-mix(in_oklab,var(--primary)_40%,transparent)] ring-offset-1 ring-offset-card forced-colors:box-border forced-colors:border-[1.5px] forced-colors:border-solid forced-colors:border-[Highlight] forced-colors:bg-transparent forced-colors:outline-2 forced-colors:outline-offset-1 forced-colors:outline-solid forced-colors:outline-[Highlight]",
};

/** Where the open lines show: under the spot, or over it. */
export type PortholeSide = "bottom" | "top";

/**
 * The pill's glass look for `floating`: translucent, blurred and softly shadowed, as a calling app's composer floats
 * over its messages, so a row passing under the pill is still visible through it. It turns solid, with a defined
 * edge and no blur, under reduced transparency and under forced colours, and keeps its shape in both.
 *
 * @claim "is still visible through it" registry/ouro/components/ouro/porthole/porthole.floating.test.tsx verify:testExists(registry/ouro/components/ouro/porthole/porthole.floating.test.tsx::Porthole floating > is translucent glass from the theme, with a blur and a soft shadow, over passing content)
 * @claim "It turns solid, with a defined edge and no blur, under reduced transparency" registry/ouro/components/ouro/porthole/porthole.floating.test.tsx verify:testExists(registry/ouro/components/ouro/porthole/porthole.floating.test.tsx::Porthole floating > turns solid with no blur under reduced transparency)
 * @claim "and under forced colours" registry/ouro/components/ouro/porthole/porthole.floating.test.tsx verify:testExists(registry/ouro/components/ouro/porthole/porthole.floating.test.tsx::Porthole floating > keeps a solid edge under forced colours, at the same size)
 */
export const portholeFloatingClass =
  "border-border/60 bg-card/75 shadow-(--shadow-lg) backdrop-blur-md " +
  "[@media(prefers-reduced-transparency:reduce)]:bg-card [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none " +
  "contrast-more:border-border contrast-more:bg-card contrast-more:backdrop-blur-none " +
  "forced-colors:border forced-colors:border-solid forced-colors:bg-[Canvas] forced-colors:backdrop-blur-none";

/** How long after one spoken change the next may be spoken, in ms. */
export const PORTHOLE_ANNOUNCE_GAP_MS = 10_000;
