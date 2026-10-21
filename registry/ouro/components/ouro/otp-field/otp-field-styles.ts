export { defaultSlotLabel, otpValidationTypes, separatorClass, slotClass, slotsClass };
export type { OtpValidationType };

// Class strings and value lists for OtpField, apart from the component so its file exports
// only components (React Fast Refresh). Class strings are literal so the app's Tailwind finds
// them when it compiles.

/**
 * The kinds of character OtpField accepts.
 *
 * @internal
 */
const otpValidationTypes = ["numeric", "alpha", "alphanumeric"] as const;

/**
 * A kind of character OtpField accepts.
 *
 * @internal
 */
type OtpValidationType = (typeof otpValidationTypes)[number];

/**
 * The row of slots.
 *
 * @internal
 */
const slotsClass = "m-0 box-border flex max-w-full items-center gap-2";

/**
 * One slot: a square with Field's control look, 44px with 16px text on phones (iOS zooms
 * into smaller text on focus), stepping down to 36px and 14px from the `sm` breakpoint with
 * a fine pointer, so a landscape phone keeps the phone size. The focused slot is outlined
 * however it got focus, because focus moves between slots as the person types.
 *
 * @internal
 * @claim registry/ouro/components/ouro/otp-field/otp-field.test.tsx verify:testExists(registry/ouro/components/ouro/otp-field/otp-field.test.tsx::OtpField looks > has 44px slots with 16px text on phones and steps down with a fine pointer from sm)
 * @claim registry/ouro/components/ouro/otp-field/otp-field.touch.test.tsx verify:testExists(registry/ouro/components/ouro/otp-field/otp-field.touch.test.tsx::keeps 44px slots and 16px text on a landscape phone, past the sm breakpoint)
 */
const slotClass =
  "m-0 box-border block size-(--ouro-otp-slot) min-w-0 shrink p-0 text-center tabular-nums " +
  "[--ouro-otp-slot:calc(var(--spacing)*11)] sm:pointer-fine:[--ouro-otp-slot:calc(var(--spacing)*9)] " +
  "rounded-md border border-solid border-input bg-transparent text-base text-foreground sm:pointer-fine:text-sm font-[inherit] caret-transparent " +
  "outline-ring outline-offset-2 focus:outline-2 focus:outline-solid " +
  "transition-[border-color] duration-(--ouro-duration-fast) ease-[ease] " +
  "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50 " +
  "dark:bg-input/30";

/**
 * The dash between groups of slots.
 *
 * @internal
 */
const separatorClass = "m-0 box-border h-0.5 w-2 shrink-0 rounded-full border-0 bg-border";

/**
 * Each slot's name after the first, which takes the field's label.
 *
 * @internal
 */
function defaultSlotLabel(position: number, length: number): string {
  return `Character ${position} of ${length}`;
}
