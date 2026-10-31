import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { NavigationRail, type NavigationRailEntry, type NavigationRailItem, type NavigationRailProps } from "@/registry/ouro/components/ouro/navigation-rail/navigation-rail";

// Type tests: `pnpm typecheck` compiles this file.

const items = [{ label: "Chat", href: "/chat", icon: null }];

expectTypeOf<ComponentProps<typeof NavigationRail>>().toEqualTypeOf<NavigationRailProps>();
expectTypeOf<{ label: "Main"; items: typeof items }>().toExtend<NavigationRailProps>();
expectTypeOf<{
  label: "Main";
  items: typeof items;
  currentPath: "/chat";
  header: "Mark";
  footer: "Settings";
  hideLabels: true;
  countLabel: "{count} unread";
  moreLabel: "Others";
  className: "max-sm:hidden";
}>().toExtend<NavigationRailProps>();
// A link with paths, a count and a current icon; a button that is current by its flag; a separator.
expectTypeOf<{ label: "Chat"; href: "/chat"; icon: null; currentIcon: null; paths: ["/people"]; count: 3; current: true; onClick: () => void }>().toExtend<NavigationRailItem>();
expectTypeOf<{ label: "Chat"; icon: null; onClick: () => void; current: true }>().toExtend<NavigationRailItem>();
expectTypeOf<{ type: "separator" }>().toExtend<NavigationRailEntry>();
expectTypeOf<{ label: "Chat"; icon: null; onClick: () => void; paths: ["/chat"] }>().not.toExtend<NavigationRailItem>();

// label, items, an item's icon and its href or onClick are required.
expectTypeOf<{ items: typeof items }>().not.toExtend<NavigationRailProps>();
expectTypeOf<{ label: "Main" }>().not.toExtend<NavigationRailProps>();
expectTypeOf<{ label: "Chat"; href: "/chat" }>().not.toExtend<NavigationRailItem>();
expectTypeOf<{ label: "Chat"; icon: null }>().not.toExtend<NavigationRailItem>();

// Guessed props name the fix.
expectTypeOf<{ label: "Main"; items: typeof items; pathname: "/" }>().not.toExtend<NavigationRailProps>();
expectTypeOf<{ label: "Main"; items: typeof items; links: typeof items }>().not.toExtend<NavigationRailProps>();
expectTypeOf<{ label: "Main"; items: typeof items; selectedId: "chat" }>().not.toExtend<NavigationRailProps>();
expectTypeOf<{ label: "Main"; items: typeof items; onSelect: () => void }>().not.toExtend<NavigationRailProps>();
expectTypeOf<{ label: "Main"; items: typeof items; collapsed: true }>().not.toExtend<NavigationRailProps>();
expectTypeOf<{ label: "Chat"; href: "/chat"; icon: null; badge: 3 }>().not.toExtend<NavigationRailItem>();
expectTypeOf<{ label: "Chat"; href: "/chat"; icon: null; activeIcon: null }>().not.toExtend<NavigationRailItem>();

// @ts-expect-error label is required.
createElement(NavigationRail, { items });
