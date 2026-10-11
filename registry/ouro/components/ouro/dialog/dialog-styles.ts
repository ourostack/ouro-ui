// Value lists and dev-message helpers shared by Dialog and its parts, apart from the
// components so each component file exports only components (React Fast Refresh).

/** A centered dialog's maximum width: `sm` 24rem, `md` 32rem, `lg` 40rem. */
export type DialogSize = "sm" | "md" | "lg";

/**
 * The three sizes, for checking a `size` prop. Shared with `Dialog`.
 *
 * @internal
 */
export const dialogSizes: readonly DialogSize[] = ["sm", "md", "lg"];

/**
 * The dev message for a size that is not one of {@link dialogSizes}. Development only.
 *
 * @internal
 */
export function dialogSizeWarning(size: string, fix: string): readonly [string, string] {
  return [`size="${size}" is not a size; use ${dialogSizes.map((name) => `"${name}"`).join(", ")}`, fix];
}
