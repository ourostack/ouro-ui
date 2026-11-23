"use client";

import { useEffect, useRef, type HTMLAttributes, type JSX, type Ref } from "react";
import { Avatar, type AvatarMember } from "@/registry/ouro/components/ouro/avatar/avatar";
import { seenBy } from "@/registry/ouro/components/ouro/read-receipt/read-receipt-styles";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { announce } from "@/registry/ouro/lib/ouro/announce";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** The props ReadReceipt adds to the `<span>` attributes it passes through. */
export interface ReadReceiptOwnProps {
  /**
   * Who has seen the message, not counting its writer, in the order they saw it. The first three show as small faces
   * (16px: their picture, or one initial in their own hue), overlapping, and a "+N" after them counts the rest. With
   * nobody, it shows no faces and holds the faces' height, so a reader's arrival does not move the messages above it.
   * @claim "The first three show as small faces" registry/ouro/components/ouro/read-receipt/read-receipt.test.tsx verify:testExists(registry/ouro/components/ouro/read-receipt/read-receipt.test.tsx::ReadReceipt > shows the first three readers as small faces, and counts the rest)
   * @claim "holds the faces' height, so a reader's arrival does not move the messages above it" registry/ouro/components/ouro/read-receipt/read-receipt.test.tsx verify:testExists(registry/ouro/components/ouro/read-receipt/read-receipt.test.tsx::ReadReceipt > holds the faces' height with no faces and no words when nobody has seen it)
   */
  readers: readonly AvatarMember[];
  /**
   * What screen readers hear, from the readers' names, for other languages.
   * @default "Seen by" the first two names, then the rest's count ("and 2 others")
   * @claim "the first two names, then the rest's count" registry/ouro/components/ouro/read-receipt/read-receipt.test.tsx verify:testExists(registry/ouro/components/ouro/read-receipt/read-receipt.test.tsx::ReadReceipt > says who has seen it, by name for up to three and with a count past that)
   */
  label?: ((names: readonly string[]) => string) | undefined;
  /** Layout only: margins (`ms-auto`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLSpanElement> | undefined;

  /** Not a prop. Who has seen it is `readers`: `<ReadReceipt readers={[{ name: "Ana Lind" }]} />`. */
  readBy?: { 'Use readers={[{ name, src }]}': never };
  /** Not a prop. Who has seen it is `readers`: `<ReadReceipt readers={[{ name: "Ana Lind" }]} />`. */
  seenBy?: { 'Use readers={[{ name, src }]}': never };
  /** Not a prop. It shows a few faces and counts the rest: `<ReadReceipt readers={readers} />`. */
  max?: { 'It shows three faces and counts the rest': never };
}

/** Props for {@link ReadReceipt}: its own props and the `<span>` attributes it passes through. */
export type ReadReceiptProps = Omit<HTMLAttributes<HTMLSpanElement>, keyof ReadReceiptOwnProps> & ReadReceiptOwnProps;

/**
 * Who has seen a message, as small faces under it: the first three readers, overlapping, then "+N" for the rest.
 * Screen readers hear it in words ("Seen by Ana Lind, Ben Ito and 2 others"), and the faces are hidden from them.
 *
 * Pass it to `Message`'s `footer`, under the last message each person has seen, so the faces move down as people
 * read. Use `AvatarGroup` instead for who is in something, and `ThreadSummary` for who replied in a thread.
 *
 * @group Chat
 * @see https://ui.ouroboros.bot/docs/read-receipt
 *
 * @example
 * <Message role="user" name="You" footer={<ReadReceipt readers={seenHere.map((person) => ({ name: person.name, src: person.photoUrl }))} />}>
 *   On my way.
 * </Message>
 * @claim "the first three readers, overlapping" registry/ouro/components/ouro/read-receipt/read-receipt.test.tsx verify:testExists(registry/ouro/components/ouro/read-receipt/read-receipt.test.tsx::ReadReceipt > shows the first three readers as small faces, and counts the rest)
 * @claim "Screen readers hear it in words" registry/ouro/components/ouro/read-receipt/read-receipt.test.tsx verify:testExists(registry/ouro/components/ouro/read-receipt/read-receipt.test.tsx::ReadReceipt > says who has seen it in words, with the faces and count hidden)
 */
export function ReadReceipt(props: ReadReceiptProps): JSX.Element | null {
  const {
    readers,
    label = seenBy,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    readBy,
    seenBy: seenByProp,
    max,
    ...rest
  } = props;
  useAppearanceClassNameCheck(
    "ReadReceipt",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; ReadReceipt takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: production only; the check never runs there.
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "ReadReceipt",
    process.env.NODE_ENV !== "production"
      ? () => [
          (readBy !== undefined || seenByProp !== undefined) && [`${readBy !== undefined ? "readBy" : "seenBy"} is not a prop; who has seen it is readers`, '<ReadReceipt readers={[{ name: "Ana Lind", src: ana }]} />'],
          max !== undefined && ["max is not a prop; it shows three faces and counts the rest", "<ReadReceipt readers={readers} />"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  // Said once, when the first reader arrives while the receipt is mounted; later readers and a receipt that mounts
  // already seen (a message drawn again) stay quiet.
  const seen = readers.length > 0;
  const wasSeen = useRef(seen);
  // Stryker disable next-line ConditionalExpression,StringLiteral: the words are read only when seen, so the unseen branch is never observed.
  const words = seen ? label(readers.map((reader) => reader.name)) : "";
  useEffect(() => {
    const before = wasSeen.current;
    wasSeen.current = seen;
    if (seen && !before) return announce(words);
  }, [seen, words]);
  if (readers.length === 0) return <span {...rest} data-ouro="read-receipt" data-slot="read-receipt-hold" aria-hidden="true" className={cn("block h-ouro-4", className)} />;
  const more = readers.length - 3;
  return (
    <span {...rest} data-ouro="read-receipt" className={cn("inline-flex items-center gap-1 text-[0.625rem] leading-none text-muted-foreground", className)}>
      <span
        aria-hidden="true"
        // 16px faces, smaller than Avatar's smallest size: a receipt is a hint, not a face to read.
        className="flex items-center *:size-ouro-4 *:text-[0.5rem] *:shadow-[0_0_0_1.5px_var(--ouro-avatar-ring,var(--background))] *:not-first:-ms-ouro-1"
      >
        {readers.slice(0, 3).map((reader, index) => (
          <Avatar key={`${reader.name}-${index}`} name={reader.name} src={reader.src} idForColor={reader.idForColor} initials={[...(reader.initials ?? reader.name.trim().toUpperCase())][0]} size="xs" alt="" />
        ))}
      </span>
      {more > 0 && (
        <span aria-hidden="true" data-ouro-read-receipt-more="" className="tabular-nums">
          +{more}
        </span>
      )}
      <span className="sr-only">{label(readers.map((reader) => reader.name))}</span>
    </span>
  );
}
