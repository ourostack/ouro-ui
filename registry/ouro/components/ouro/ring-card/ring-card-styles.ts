import { defineComponentAx, RESERVED_PERSON_ONLY } from "@/registry/ouro/ax/component";

/**
 * RingCard's answer and decline actions, reserved for the person. The host binds its
 * callbacks to these actions and supplies refusing CLI words with `bindAx`.
 *
 * @example
 * bindAx(ringCardAx, { refuseAs: { answer: "app call answer", decline: "app call decline" } });
 * @claim "reserved for the person" registry/ouro/components/ouro/ring-card/ring-card.test.tsx verify:testExists(registry/ouro/components/ouro/ring-card/ring-card.test.tsx::RingCard > declares answer and decline person-only and marks every action for X-ray)
 */
export const ringCardAx = defineComponentAx({
  component: "RingCard",
  reads: [],
  actions: [
    { id: "answer", summary: "Answer the incoming call with audio or video.", effect: "others", personOnly: RESERVED_PERSON_ONLY.answer! },
    { id: "decline", summary: "Decline the incoming call.", effect: "others", personOnly: RESERVED_PERSON_ONLY.decline! },
  ],
});

/** Entry comes from above, with a fade in place for reduced motion. @internal */
export const arrival =
  "starting:opacity-0 motion-safe:starting:[transform:translateY(-0.75rem)] " +
  "motion-safe:[transition:opacity_var(--ouro-duration-base)_var(--ouro-ease-out),transform_var(--ouro-duration-base)_var(--ouro-ease-out)] " +
  "motion-reduce:[transition:opacity_var(--ouro-duration-fast)_var(--ouro-ease-out)]";
