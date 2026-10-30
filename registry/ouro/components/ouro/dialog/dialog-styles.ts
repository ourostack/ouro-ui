export { dialogSizes, dialogSizeWarning };
export type { DialogSize };

// Value lists and dev-message helpers shared by Dialog and its parts, apart from the
// components so each component file exports only components (React Fast Refresh). The
// export list comes first because the shadcn CLI drops comments before a file's first statement.

/**
 * A centered dialog's width: `sm` (24rem), `md` (32rem) and `lg` (40rem) are fixed widths, for forms and text.
 * `xl` (56rem), `2xl` (72rem) and `full` (the whole viewport) are caps for wide content, such as a
 * gallery or a table: the dialog fits its content, at least 32rem and at most the cap. Every size narrows
 * to the viewport less its 1rem margins (or the safe area). A paragraph's natural width is its whole line,
 * so text alone widens an `xl` or wider dialog to its cap; the default stays `md` for that reason.
 *
 * @claim "A centered dialog's width" registry/ouro/components/ouro/dialog/dialog-parts.tsx verify:fileLine(registry/ouro/components/ouro/dialog/dialog-parts.tsx, /const\spopupSizes\s=\s\{\ssm:\s"w-full\smax-w-\[24rem\]",\smd:\s"w-full\smax-w-\[32rem\]",\slg:\s"w-full\smax-w-\[40rem\]",\sxl:\s"w-fit\smin-w-\[min\(32rem,100%\)\]\smax-w-\[min\(56rem,100%\)\]",\s"2xl":\s"w-fit\smin-w-\[min\(32rem,100%\)\]\smax-w-\[min\(72rem,100%\)\]",\sfull:\s"w-fit\smin-w-\[min\(32rem,100%\)\]\smax-w-full"\s\}/)
 * @claim "A centered dialog's width" registry/ouro/components/ouro/dialog/dialog.test.tsx verify:testExists(registry/ouro/components/ouro/dialog/dialog.test.tsx::centered dialog > caps size %s at %ipx wide)
 * @claim "`xl` (56rem), `2xl` (72rem) and" registry/ouro/components/ouro/dialog/dialog.test.tsx verify:testExists(registry/ouro/components/ouro/dialog/dialog.test.tsx::centered dialog > fits size %s to its content, from 32rem up to %ipx)
 * @claim "A paragraph's natural width is its" registry/ouro/components/ouro/dialog/dialog.test.tsx verify:testExists(registry/ouro/components/ouro/dialog/dialog.test.tsx::centered dialog > widens size %s to its cap for a long paragraph, so wide sizes are for wide content)
 * @claim "Every size narrows to the viewport" registry/ouro/components/ouro/dialog/dialog.test.tsx verify:testExists(registry/ouro/components/ouro/dialog/dialog.test.tsx::centered dialog > keeps size %s inside a 390px phone's 16px margins when presentation is dialog)
 */
type DialogSize = "sm" | "md" | "lg" | "xl" | "2xl" | "full";

/**
 * The six sizes, for checking a `size` prop. Shared with `Dialog`.
 *
 * @internal
 * @claim "The six sizes, for checking a" registry/ouro/components/ouro/dialog/dialog.test.tsx verify:testExists(registry/ouro/components/ouro/dialog/dialog.test.tsx::Dialog parts > renders an md DialogPopup for a size that is not one of Ouro UI's, and warns once with the fix)
 */
const dialogSizes: readonly DialogSize[] = ["sm", "md", "lg", "xl", "2xl", "full"];

/**
 * The dev message for a size that is not one of {@link dialogSizes}. Development only.
 *
 * @internal
 */
function dialogSizeWarning(size: string, fix: string): readonly [string, string] {
  return [`size="${size}" is not a size; use ${dialogSizes.map((name) => `"${name}"`).join(", ")}`, fix];
}
