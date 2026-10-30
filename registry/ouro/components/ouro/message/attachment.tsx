"use client";

import type { HTMLAttributes, JSX, MouseEvent, ReactNode, Ref } from "react";
import { useFocusHandoff } from "@/registry/ouro/lib/ouro/focus-handoff";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** What kind of file an attachment is, which picks its icon. */
export type AttachmentKind = "doc" | "sheet" | "slides" | "pdf" | "image" | "video" | "audio" | "zip" | "code" | "file";

/** The props Attachment adds to the `<div>` attributes it passes through. */
export interface AttachmentOwnProps {
  /**
   * The file's name, as the user sees it: "menu.pdf". Required, so every file has a name.
   *
   * @claim "Required, so every file has a" registry/ouro/components/ouro/message/attachment.test-d.ts verify:fileLine(registry/ouro/components/ouro/message/attachment.test-d.ts, /expectTypeOf<\{\shref:\s"\/menu\.pdf"\s\}>\(\)\.not\.toExtend<AttachmentProps>/)
   */
  name: string;
  /** Where the file opens or downloads. With it, the attachment is a link named by the file and its size. */
  href?: string | undefined;
  /** Downloads the file instead of opening it (the link's `download` attribute). Needs `href`. */
  download?: boolean | undefined;
  /** The file's size in bytes (`file.size`), shown as "1.2 MB". */
  size?: number | undefined;
  /** The file's MIME type (`file.type`). With the name's extension, it picks the icon: "application/pdf" or "menu.pdf" shows a PDF's. */
  contentType?: string | undefined;
  /**
   * The kind of file, for its icon, when the type and the name do not say: a document, a spreadsheet, slides, a PDF,
   * an image, a video, audio, an archive, code, or any other file.
   * @default from `contentType`, then the name's extension, else "file"
   */
  kind?: AttachmentKind | (string & { 'Use "doc", "sheet", "slides", "pdf", "image", "video", "audio", "zip", "code" or "file"': never }) | undefined;
  /** An icon to show instead of the one for the file's kind, such as the app's own file-type icons. */
  icon?: ReactNode;
  /**
   * Opens the file in the app, for example in a `Lightbox`. Without `href` the attachment is a button that calls it.
   * With `href` it stays a link: a plain click calls it instead of following the link, and a click with a modifier
   * key (a new tab, a new window) or the middle button follows the link as usual.
   */
  onOpen?: ((event: MouseEvent<HTMLElement>) => void) | undefined;
  /** Shows a remove button, which calls this. Use it while composing a message, before it is sent. */
  onRemove?: (() => void) | undefined;
  /** The remove button's accessible name, for other languages. @default (name) => `Remove ${name}` */
  removeLabel?: ((name: string) => string) | undefined;
  /**
   * Writes `size` for other languages or units.
   * @default "512 B", "2 kB", "1.2 MB", in steps of 1024
   * @claim "in steps of 1024" registry/ouro/components/ouro/message/attachment.test.tsx verify:testExists(registry/ouro/components/ouro/message/attachment.test.tsx::Attachment > names the file and gives its size in readable units) verify:fileLine(registry/ouro/components/ouro/message/attachment.test.tsx, /\[2048,\s"2\skB"\]/)
   */
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

/**
 * "512 B", "2 kB", "1.2 MB": steps of 1024, at most one decimal.
 *
 * @claim "steps of 1024, at most one decimal" registry/ouro/components/ouro/message/attachment.test.tsx verify:testExists(registry/ouro/components/ouro/message/attachment.test.tsx::Attachment > names the file and gives its size in readable units)
 * @claim "steps of 1024, at most one decimal" registry/ouro/components/ouro/message/attachment.test.tsx verify:fileLine(registry/ouro/components/ouro/message/attachment.test.tsx, /\[2048,\s"2\skB"\]/)
 */
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

const kinds = ["doc", "sheet", "slides", "pdf", "image", "video", "audio", "zip", "code", "file"] as const;

/** A kind's MIME types, space-separated, beyond the image, video and audio families. */
const typeSources: ReadonlyArray<readonly [AttachmentKind, string]> = [
  ["pdf", "application/pdf"],
  [
    "doc",
    "application/msword application/vnd.openxmlformats-officedocument.wordprocessingml.document application/vnd.oasis.opendocument.text application/rtf text/plain text/markdown",
  ],
  ["sheet", "application/vnd.ms-excel application/vnd.openxmlformats-officedocument.spreadsheetml.sheet application/vnd.oasis.opendocument.spreadsheet text/csv"],
  ["slides", "application/vnd.ms-powerpoint application/vnd.openxmlformats-officedocument.presentationml.presentation application/vnd.oasis.opendocument.presentation"],
  ["zip", "application/zip application/x-7z-compressed application/vnd.rar application/gzip application/x-tar"],
  ["code", "application/json text/javascript text/html text/css application/xml text/xml"],
];

/** A kind's file name extensions, space-separated. */
const extensionSources: ReadonlyArray<readonly [AttachmentKind, string]> = [
  ["pdf", "pdf"],
  ["doc", "doc docx odt rtf txt md pages"],
  ["sheet", "xls xlsx ods csv tsv numbers"],
  ["slides", "ppt pptx odp key"],
  ["image", "png jpg jpeg gif webp svg heic avif bmp tif tiff"],
  ["video", "mp4 mov webm mkv avi m4v"],
  ["audio", "mp3 wav m4a ogg flac aac"],
  ["zip", "zip 7z rar gz tgz tar bz2 xz"],
  ["code", "js jsx ts tsx json py rb go rs java c cpp h cs swift kt sh yml yaml toml html css xml sql php"],
];
const lookup = (sources: ReadonlyArray<readonly [AttachmentKind, string]>) => new Map(sources.flatMap(([kind, list]) => list.split(" ").map((key) => [key, kind] as const)));
const byType = lookup(typeSources);
const byExtension = lookup(extensionSources);

/**
 * The kind from the MIME type (its whole family for images, video and audio), then from the name's extension.
 *
 * @claim "The kind from the MIME type" registry/ouro/components/ouro/message/attachment.test.tsx verify:testExists(registry/ouro/components/ouro/message/attachment.test.tsx::Attachment > picks the icon from the MIME type, then the name's extension)
 */
function kindOf(contentType: string | undefined, name: string): AttachmentKind {
  // Stryker disable next-line StringLiteral: without a type, any string that is no MIME type gives the same answer.
  const type = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const family = type.split("/")[0]!;
  if (family === "image" || family === "video" || family === "audio") return family;
  const dot = name.lastIndexOf(".");
  return byType.get(type) ?? (dot > 0 ? byExtension.get(name.slice(dot + 1).toLowerCase()) : undefined) ?? "file";
}

/**
 * A file attached to a chat message, or waiting to be sent with one: an icon for its kind,
 * its name and size. With `href` it is a link that opens or downloads the file; with
 * `onOpen` it opens the file in the app, such as in a `Lightbox`; with `onRemove` it has a
 * remove button, named after the file, for the composer. Long names truncate.
 *
 * Use `Link` instead for a link that is not a file, and `Avatar` for a person's picture.
 *
 * @group Chat
 * @see https://ui.ouro.bot/docs/attachment
 *
 * @example
 * <Attachment name="menu.pdf" size={file.size} contentType={file.type} href={file.url} />
 * <Attachment name={file.name} size={file.size} onRemove={() => remove(file)} />
 * <Attachment name="crumb.jpg" contentType="image/jpeg" href={file.url} onOpen={() => showInLightbox(file)} />
 */
export function Attachment(props: AttachmentProps): JSX.Element {
  const {
    name: nameProp,
    href,
    download,
    size,
    contentType,
    kind: kindProp,
    icon,
    onOpen,
    onRemove,
    removeLabel = (file: string) => `Remove ${file}`,
    formatSize = defaultFormatSize,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    fileName,
    filename,
    url,
    onDelete,
    onDismiss,
    ...rest
  } = props;
  const name = nameProp ?? "";
  const kind: AttachmentKind = (kinds as readonly string[]).includes(kindProp as string) ? (kindProp as AttachmentKind) : kindOf(contentType, name);
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
          download !== undefined && href === undefined && ["download needs href, the file to download", '<Attachment name="menu.pdf" href="/menu.pdf" download />'],
          size !== undefined && !validSize(size) && [`size={${String(size)}} is not a byte count`, '<Attachment name="menu.pdf" size={file.size} />'],
          kindProp !== undefined && kind !== kindProp && [`kind="${String(kindProp)}" is not a kind; use "doc", "sheet", "slides", "pdf", "image", "video", "audio", "zip", "code" or "file"`, '<Attachment name="notes" kind="doc" />'],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const body = (
    <>
      {icon === undefined || icon === null || icon === false ? (
        <FileIcon kind={kind} />
      ) : (
        <span aria-hidden="true" data-ouro-attachment-icon={kind} className="flex size-5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-5">
          {icon}
        </span>
      )}
      <span data-ouro-attachment-name="" title={name} className="min-w-0 flex-1 truncate font-medium">
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
  const openableClass = "press rounded-[inherit] text-inherit no-underline pointer-fine:hover:bg-accent pointer-fine:hover:text-accent-foreground motion-safe:active:scale-(--ouro-press-scale)";
  // A remove button that removes the attachment hands its focus to the next one, or the one before.
  const merged = useMergedRef(ref, useFocusHandoff<HTMLDivElement>());
  return (
    <div
      {...rest}
      ref={merged}
      data-ouro="attachment"
      className={cn(
        "relative box-border inline-flex max-w-full min-w-0 items-center rounded-lg border border-solid border-border bg-card",
        "align-middle text-base text-card-foreground pointer-fine:text-sm",
        className,
      )}
    >
      {href !== undefined ? (
        <a
          href={href}
          download={download || undefined}
          data-ouro-control="attachment"
          data-ouro-part="link"
          onClick={
            onOpen &&
            ((event) => {
              // A new tab or window, or a download, is the link's own job.
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onOpen(event);
            })
          }
          className={cn(inner, openableClass, focusRing)}
        >
          {body}
        </a>
      ) : onOpen ? (
        <button type="button" data-ouro-control="attachment" data-ouro-part="open" onClick={onOpen} className={cn(inner, openableClass, "m-0 cursor-pointer border-0 bg-transparent text-start font-[inherit]", focusRing)}>
          {body}
        </button>
      ) : (
        <span className={inner}>{body}</span>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel(name)}
          data-ouro-control="attachment"
          data-ouro-part="remove"
          onClick={onRemove}
          className={cn(
            "press relative m-0 box-border inline-flex size-11 shrink-0 pointer-fine:me-1.5 pointer-fine:size-7 items-center justify-center rounded-md border-0 bg-transparent p-0",
            "cursor-pointer text-muted-foreground touch-manipulation pointer-fine:hover:bg-accent pointer-fine:hover:text-accent-foreground",
            "motion-safe:active:scale-(--ouro-press-scale)",
            focusRing,
          )}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="size-4">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      )}
    </div>
  );
}

// The page every document-like kind draws, with its corner folded.
const page = "M11.5 2.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7zM11.5 2.5V7H16";

/** A kind's drawing, a single path on the icon's grid. */
const glyphs: Readonly<Record<AttachmentKind, string>> = {
  file: page,
  doc: `${page}M7 10.5h6M7 13.5h4`,
  sheet: `${page}M7 10h6v4.5H7zM10 10v4.5M7 12.25h6`,
  slides: `${page}M7 10h6v3.5H7zM8.5 15.5h3`,
  pdf: `${page}M2.5 10.5h8v4h-8z`,
  code: `${page}M8.5 10l-1.5 2 1.5 2M11.5 10l1.5 2-1.5 2`,
  zip: `${page}M10 2.5v1.5M10 5.5v1.5M10 8.5v1.5M8.75 11.5h2.5v2.5h-2.5z`,
  image: "M5 3.5h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2zM6 8a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0zM3.5 14.5l4-4 3 3 2-2 4 4",
  video: "M4.5 4.5h11a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM8.5 7.5v5l4-2.5z",
  audio: "M8 14.5V5l8-1.5V13M8 14.5a2 2 0 1 1-4 0a2 2 0 1 1 4 0zM16 13a2 2 0 1 1-4 0a2 2 0 1 1 4 0z",
};

// Documents, spreadsheets, slides and PDFs take the colors people know them by, from the theme's tokens;
// the rest stay muted.
const kindToneClass: Readonly<Record<AttachmentKind, string>> = {
  doc: "text-primary",
  sheet: "text-success",
  slides: "text-warning",
  pdf: "text-destructive",
  image: "text-muted-foreground",
  video: "text-muted-foreground",
  audio: "text-muted-foreground",
  zip: "text-muted-foreground",
  code: "text-muted-foreground",
  file: "text-muted-foreground",
};

/** The drawing for the file's kind. */
function FileIcon({ kind }: { kind: AttachmentKind }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      data-ouro-attachment-icon={kind}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-5 shrink-0", kindToneClass[kind])}
    >
      <path d={glyphs[kind]} />
    </svg>
  );
}
