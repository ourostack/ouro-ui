"use client";

import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { createContext, useContext, type JSX } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { devThrow } from "@/registry/ouro/lib/ouro/dev";
import {
  indicatorClass,
  listClass,
  ownLook,
  panelClass,
  rootClass,
  tabClass,
} from "@/registry/ouro/components/ouro/tabs/tabs-styles";

const TabsContext = createContext(false);

/** Throws in development, with the JSX the part belongs in, unless it sits inside a TabsRoot. */
function useTabsPart(part: string, inner: string): void {
  if (!useContext(TabsContext)) {
    devThrow(
      part,
      "must be rendered inside <TabsRoot>",
      process.env.NODE_ENV !== "production"
        ? `<TabsRoot defaultValue="…"><TabsList aria-label="…"><TabsTab value="…">…</TabsTab><TabsIndicator /></TabsList><TabsPanel value="…">…</TabsPanel></TabsRoot>, with ${inner} in its place`
        : /* istanbul ignore next @preserve -- production only */ "",
    );
  }
}

/** Runs the className check for a part, with a hint only in development. */
function usePartClassName(part: string, className: unknown): void {
  useAppearanceClassNameCheck(
    part,
    typeof className === "string" ? className : undefined,
    process.env.NODE_ENV !== "production" ? ownLook(part) : /* istanbul ignore next @preserve -- production only */ "",
  );
}

/** Props for {@link TabsRoot}. `className` is for layout only. */
export type TabsRootProps = Omit<BaseTabs.Root.Props, "className"> & { className?: string | undefined };

/**
 * Part: the state owner of tabs built from parts. Use the `Tabs` component instead
 * unless its `items` cannot express your layout, such as a tab that holds a badge next to
 * its label or a panel shared by two tabs.
 *
 * @example
 * <TabsRoot defaultValue="ingredients">
 *   <TabsList aria-label="Recipe">
 *     <TabsTab value="ingredients">Ingredients</TabsTab>
 *     <TabsTab value="method">Method</TabsTab>
 *     <TabsIndicator />
 *   </TabsList>
 *   <TabsPanel value="ingredients">…</TabsPanel>
 *   <TabsPanel value="method">…</TabsPanel>
 * </TabsRoot>
 */
export function TabsRoot(props: TabsRootProps): JSX.Element {
  usePartClassName("TabsRoot", props.className);
  return <TabsRootUnchecked {...props} />;
}

/**
 * The root without its own className check, for `Tabs`, which checks its own.
 *
 * @internal
 */
export function TabsRootUnchecked({ className, ...props }: TabsRootProps): JSX.Element {
  return (
    <TabsContext.Provider value>
      <BaseTabs.Root {...props} data-ouro="tabs" className={cn(rootClass, className)} />
    </TabsContext.Provider>
  );
}

/** Props for {@link TabsList}. Name the list with `aria-label`. */
export type TabsListProps = Omit<BaseTabs.List.Props, "className"> & { className?: string | undefined };

/**
 * Part: the row (or column) of tabs. Name it with `aria-label` when the page has more than
 * one set of tabs. `activateOnFocus` selects a tab when the arrow keys focus it.
 */
export function TabsList({ className, ...props }: TabsListProps): JSX.Element {
  useTabsPart("TabsList", '<TabsList aria-label="…">…</TabsList>');
  usePartClassName("TabsList", className);
  return <BaseTabs.List {...props} className={cn(listClass, className)} />;
}

/** Props for {@link TabsTab}. */
export type TabsTabProps = Omit<BaseTabs.Tab.Props, "className"> & { className?: string | undefined };

/** Part: one tab, a button that shows the panel with the same `value`. */
export function TabsTab({ className, ...props }: TabsTabProps): JSX.Element {
  useTabsPart("TabsTab", '<TabsTab value="…">…</TabsTab>');
  usePartClassName("TabsTab", className);
  return <BaseTabs.Tab {...props} className={cn(tabClass, className)} />;
}

/** Part: the line that slides to the selected tab. Put it last inside `TabsList`. */
export function TabsIndicator(props: Omit<BaseTabs.Indicator.Props, "className">): JSX.Element {
  useTabsPart("TabsIndicator", "<TabsIndicator />");
  return <BaseTabs.Indicator {...props} data-ouro-tabs-indicator="" className={indicatorClass} />;
}

/** Props for {@link TabsPanel}. */
export type TabsPanelProps = Omit<BaseTabs.Panel.Props, "className"> & { className?: string | undefined };

/** Part: the content shown while the tab with the same `value` is selected. */
export function TabsPanel({ className, ...props }: TabsPanelProps): JSX.Element {
  useTabsPart("TabsPanel", '<TabsPanel value="…">…</TabsPanel>');
  usePartClassName("TabsPanel", className);
  return <BaseTabs.Panel {...props} className={cn(panelClass, className)} />;
}
