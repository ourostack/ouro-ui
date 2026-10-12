import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Attachment, type AttachmentProps } from "@/registry/ouro/components/ouro/message/attachment";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ name: "menu.pdf" }>().toExtend<AttachmentProps>();
expectTypeOf<{
  name: "menu.pdf";
  href: "/menu.pdf";
  download: true;
  size: 2048;
  contentType: "application/pdf";
  onRemove: () => void;
  removeLabel: (name: string) => string;
  formatSize: (bytes: number) => string;
}>().toExtend<AttachmentProps>();
expectTypeOf<ComponentProps<typeof Attachment>>().toEqualTypeOf<AttachmentProps>();

// name is required; the names agents guess for it, the link and removal name the fix.
expectTypeOf<{ href: "/menu.pdf" }>().not.toExtend<AttachmentProps>();
expectTypeOf<{ name: "a"; fileName: "menu.pdf" }>().not.toExtend<AttachmentProps>();
expectTypeOf<{ name: "a"; url: "/menu.pdf" }>().not.toExtend<AttachmentProps>();
expectTypeOf<{ name: "a"; onDelete: () => void }>().not.toExtend<AttachmentProps>();

// @ts-expect-error name is required.
createElement(Attachment, { href: "/menu.pdf" });
