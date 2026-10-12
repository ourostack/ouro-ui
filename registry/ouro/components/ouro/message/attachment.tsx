"use client";

import type { HTMLAttributes, JSX, Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";

/** The props Attachment adds to the `<div>` attributes it passes through. */
export interface AttachmentOwnProps {
  /** The file's name, as the user sees it: "menu.pdf". Required, so every file has a name. */
  name: string;
  /** Where the file opens or downloads. With it, the attachment is a link named by the file and its size. */
  href?: string | undefined;
  /** Downloads the file instead of opening it (the link's `download` attribute). Needs `href`. */
  download?: boolean | undefined;
  /** The file's size in bytes (`file.size`), shown as "1.2 MB". */
  size?: number | undefined;
  /** The file's MIME type (`file.type`): `image/*` shows an image icon, anything else a file icon. */
  contentType?: string | undefined;
  /** Shows a remove button, which calls this. Use it while composing a message, before it is sent. */
  onRemove?: (() => void) | undefined;
  /** The remove button's accessible name, for other languages. @default (name) => `Remove ${name}` */
  removeLabel?: ((name: string) => string) | undefined;
  /** Writes `size` for other languages or units. @default "512 B", "2 kB", "1.2 MB", in steps of 1024 */
  formatSize?: ((bytes: number) => string) | undefined;
  /** Layout only: margins, width (`mt-2`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. The file's name is `name`: `<Attachment name="menu.pdf" />`. */
  fileName?: { 'Use <Attachment name="menu.pdf" />': never };
  /** Not a prop. The file's name is `name`: `<Attachment name="menu.pdf" />`. */
  filename?: { 'Use <Attachment name="menu.pdf" />': never };
  /** Not a prop. The file's address is `href`: `<Attachment name="menu.pdf" href="/menu.pdf" />`. */
  url?: { 'Use <Attachment name="menu.pdf" href="/menu.pdf" />': never };
  /** Not a prop. Use `onRemove`: `<Attachment name="menu.pdf" onRemove={remove} />`. */
  onDelete?: { 'Use <Attachment name="menu.pdf" onRemove={remove} />': never };
  /** Not a prop. Use `onRemove`: `<Attachment name="menu.pdf" onRemove={remove} />`. */
  onDismiss?: { 'Use <Attachment name="menu.pdf" onRemove={remove} />': never };
}

/** Props for {@link Attachment}: its own props and the `<div>` attributes it passes through. */
export type AttachmentProps = Omit<HTMLAttributes<HTMLDivElement>, keyof AttachmentOwnProps> & AttachmentOwnProps;

const units = ["B", "kB", "MB", "GB", "TB"] as const;
const oneDecimal = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

/** "512 B", "2 kB", "1.2 MB": steps of 1024, at most one decimal. */
function defaultFormatSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${oneDecimal.format(value)} ${units[unit]}`;
}

const validSize = (size: number | undefined): size is number => typeof size === "number" && Number.isFinite(size) && size >= 0;

const focusRing = "outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/**
 * A file attached to a chat message, or waiting to be sent with one: its icon, name and
 * size. With `href` it is a link that opens or downloads the file; with `onRemove` it has
 * a remove button, named after the file, for the composer. Long names truncate.
 *
 * Use `Link` instead for a link that is not a file, and `Avatar` for a person's picture.
 *
 * @group Chat
 * @see https://ourostack.github.io/ouro-ui/docs/attachment
 *
 * @example
 * <Attachment name="menu.pdf" size={file.size} contentType={file.type} href={file.url} />
 * <Attachment name={file.name} size={file.size} onRemove={() => remove(file)} />
 */
export function Attachment(props: AttachmentProps): JSX.Element {
  const {
    name: nameProp,
    href,
    download,
    size,
    contentType,
    onRemove,
    removeLabel = (file: string) => `Remove ${file}`,
    formatSize = defaultFormatSize,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    fileName,
    filename,
    url,
    onDelete,
    onDismiss,
    ...rest
  } = props;
  const name = nameProp ?? "";
  useAppearanceClassNameCheck(
    "Attachment",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `<div className="${token}"><Attachment /></div>`
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Attachment",
    process.env.NODE_ENV !== "production"
      ? () => [
          nameProp === undefined && ["name is missing, so the file has no name", '<Attachment name="menu.pdf" />'],
          (fileName !== undefined || filename !== undefined) && [`${fileName !== undefined ? "fileName" : "filename"} is not a prop`, '<Attachment name="menu.pdf" />'],
          url !== undefined && ["url is not a prop", '<Attachment name="menu.pdf" href="/menu.pdf" />'],
          (onDelete !== undefined || onDismiss !== undefined) && [
            `${onDelete !== undefined ? "onDelete" : "onDismiss"} is not a prop`,
            '<Attachment name="menu.pdf" onRemove={remove} />',
          ],
          size !== undefined && !validSize(size) && [`size={${String(size)}} is not a byte count`, '<Attachment name="menu.pdf" size={file.size} />'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const image = contentType?.startsWith("image/") ?? false;
  const body = (
    <>
      <FileIcon image={image} />
      <span data-ouro-attachment-name="" className="min-w-0 flex-1 truncate font-medium">
        {name}
      </span>
      {validSize(size) && (
        <>
          {/* A space, so the link's name reads "menu.pdf 2 kB". */}
          <span className="sr-only"> </span>
          <span data-ouro-attachment-size="" className="shrink-0 text-muted-foreground tabular-nums">
            {formatSize(size)}
          </span>
        </>
      )}
    </>
  );
  const inner = "flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3 pointer-fine:min-h-9";
  return (
    <div
      {...rest}
      data-ouro="attachment"
      className={cn(
        "relative m-0 box-border inline-flex max-w-full min-w-0 items-center rounded-lg border border-solid border-border bg-card",
        "align-middle text-base text-card-foreground pointer-fine:text-sm",
        className,
      )}
    >
      {href !== undefined ? (
        <a
          href={href}
          download={download || undefined}
          className={cn(
            inner,
            "press rounded-[inherit] text-inherit no-underline hover:bg-accent hover:text-accent-foreground",
            "motion-safe:active:scale-(--ouro-press-scale) active:duration-(--ouro-duration-fast)",
            focusRing,
          )}
        >
          {body}
        </a>
      ) : (
        <span className={inner}>{body}</span>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel(name)}
          onClick={onRemove}
          className={cn(
            "press relative m-0 me-1.5 box-border inline-flex size-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0",
            "cursor-pointer text-muted-foreground touch-manipulation hover:bg-accent hover:text-accent-foreground",
            "motion-safe:active:scale-(--ouro-press-scale) active:duration-(--ouro-duration-fast)",
            focusRing,
          )}
        >
          <TouchTarget />
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="size-4">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** A page with a folded corner, or a framed picture for images. */
function FileIcon({ image }: { image: boolean }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      data-ouro-attachment-icon={image ? "image" : "file"}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0 text-muted-foreground"
    >
      {image ? (
        <>
          <rect x="3" y="3.5" width="14" height="13" rx="2" />
          <circle cx="7.5" cy="8" r="1.5" />
          <path d="M3.5 14.5l4-4 3 3 2-2 4 4" />
        </>
      ) : (
        <>
          <path d="M11.5 2.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7z" />
          <path d="M11.5 2.5V7H16" />
        </>
      )}
    </svg>
  );
}
