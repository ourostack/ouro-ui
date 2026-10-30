import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Avatar, AvatarGroup, type AvatarGroupProps, type AvatarPresence, type AvatarProps } from "@/registry/ouro/components/ouro/avatar/avatar";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ name: "Ada Lovelace" }>().toExtend<AvatarProps>();
expectTypeOf<{ name: "Ada Lovelace"; src: "/ada.jpg"; alt: ""; initials: "AL"; size: "xl" }>().toExtend<AvatarProps>();
expectTypeOf<ComponentProps<typeof Avatar>>().toEqualTypeOf<AvatarProps>();
expectTypeOf<{ name: "Ada"; shape: "square"; color: "brand"; idForColor: "u-1"; icon: null }>().toExtend<AvatarProps>();
expectTypeOf<{ name: "Ada"; presence: "do-not-disturb"; presenceLabel: "Do not disturb" }>().toExtend<AvatarProps>();
// A presence that may be missing, with its label, type checks as it is.
expectTypeOf<{ name: "Ada"; presence: AvatarPresence | undefined; presenceLabel: string }>().toExtend<AvatarProps>();
expectTypeOf<{ label: "Cooks"; max: 3; total: 12; size: "sm"; children: null }>().toExtend<AvatarGroupProps>();
expectTypeOf<ComponentProps<typeof AvatarGroup>>().toEqualTypeOf<AvatarGroupProps>();

// name is required; children, fallback and unknown sizes name the fix.
expectTypeOf<{ src: "/ada.jpg" }>().not.toExtend<AvatarProps>();
expectTypeOf<{ name: "Ada"; children: "AL" }>().not.toExtend<AvatarProps>();
expectTypeOf<{ name: "Ada"; fallback: "AL" }>().not.toExtend<AvatarProps>();
expectTypeOf<{ name: "Ada"; size: "4xl" }>().not.toExtend<AvatarProps>();
expectTypeOf<{ name: "Ada"; size: 40 }>().not.toExtend<AvatarProps>();
// A presence needs the words it says; unknown shapes, colors and presences name the fix.
expectTypeOf<{ name: "Ada"; presence: "busy" }>().not.toExtend<AvatarProps>();
expectTypeOf<{ name: "Ada"; presence: "dnd"; presenceLabel: "Busy" }>().not.toExtend<AvatarProps>();
expectTypeOf<{ name: "Ada"; shape: "rounded" }>().not.toExtend<AvatarProps>();
expectTypeOf<{ name: "Ada"; color: "blue" }>().not.toExtend<AvatarProps>();
// AvatarGroup needs a label.
expectTypeOf<{ children: null }>().not.toExtend<AvatarGroupProps>();

// @ts-expect-error name is required.
createElement(Avatar, { src: "/ada.jpg" });
// @ts-expect-error presence needs presenceLabel.
createElement(Avatar, { name: "Ada", presence: "busy" });
