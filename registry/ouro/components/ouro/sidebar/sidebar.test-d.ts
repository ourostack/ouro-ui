import { createElement, type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { Sidebar, type SidebarItem, type SidebarProps, type SidebarSection } from "@/registry/ouro/components/ouro/sidebar/sidebar";

// Type tests: `pnpm typecheck` compiles this file.

const sections = [{ label: "Library", items: [{ label: "Recipes", href: "/recipes" }] }] as const;

expectTypeOf<ComponentProps<typeof Sidebar>>().toEqualTypeOf<SidebarProps>();
expectTypeOf<{ label: "Main"; sections: typeof sections }>().toExtend<SidebarProps>();
expectTypeOf<{
  label: "Main";
  sections: typeof sections;
  currentPath: "/recipes";
  header: "Spoonjoy";
  footer: "Ari";
  collapsible: false;
  collapsed: true;
  onCollapsedChange: (collapsed: boolean) => void;
  collapseLabel: "Collapse";
  menuLabel: "Menu";
  closeLabel: "Close";
}>().toExtend<SidebarProps>();
expectTypeOf<{ items: [] }>().toExtend<SidebarSection>();
expectTypeOf<{ label: "Recipes"; href: "/recipes"; current: true }>().toExtend<SidebarItem>();

// label and sections are required; an item needs an href; the guessed props name the fix.
expectTypeOf<{ sections: typeof sections }>().not.toExtend<SidebarProps>();
expectTypeOf<{ label: "Main" }>().not.toExtend<SidebarProps>();
expectTypeOf<{ label: "Recipes" }>().not.toExtend<SidebarItem>();
expectTypeOf<{ label: "Main"; sections: typeof sections; items: [] }>().not.toExtend<SidebarProps>();
expectTypeOf<{ label: "Main"; sections: typeof sections; isCollapsed: true }>().not.toExtend<SidebarProps>();
expectTypeOf<{ label: "Main"; sections: typeof sections; pathname: "/" }>().not.toExtend<SidebarProps>();
expectTypeOf<{ label: "Main"; sections: typeof sections; children: "x" }>().not.toExtend<SidebarProps>();

// @ts-expect-error label is required.
createElement(Sidebar, { sections });
