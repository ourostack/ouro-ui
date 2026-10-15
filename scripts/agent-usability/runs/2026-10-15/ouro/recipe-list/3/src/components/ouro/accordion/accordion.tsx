"use client";

import { Accordion as BaseAccordion } from "@base-ui/react/accordion";
import { useSyncExternalStore, type JSX, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/lib/ouro/class-name-check";
import { cn } from "@/lib/ouro/cn";
import { devThrow } from "@/lib/ouro/dev";
import { useDevWarnings } from "@/lib/ouro/use-dev-messages";
import {
  headerClass,
  headingLevels,
  iconClass,
  itemClass,
  ownLook,
  panelClass,
  panelContentClass,
  rootClass,
  triggerClass,
  type AccordionHeadingLevel,
} from "@/components/ouro/accordion/accordion-styles";

export type { AccordionHeadingLevel } from "@/components/ouro/accordion/accordion-styles";

/** One item: a title that opens and closes its content. */
export interface AccordionItem {
  /**
   * Identifies the item: `value`, `defaultValue` and `onValueChange` use it. Unique within the
   * accordion. @default the item's index, as a string ("0", "1", …)
   */
  value?: string | undefined;
  /** The title, always visible. It is the button that opens the item, inside a heading. */
  title: ReactNode;
  /** What shows while the item is open. */
  content: ReactNode;
  /** Shows the item but keeps it from opening or closing. */
  disabled?: boolean | undefined;
}

/** Props every Accordion takes. */
export interface AccordionBaseProps {
  /** The items, in order. */
  items: readonly AccordionItem[];
  /**
   * The outline level of each title, so the items sit in the page's heading structure:
   * `headingLevel={2}` renders `<h2>`. @default 3
   */
  headingLevel?: AccordionHeadingLevel | (number & { 'Use 2, 3, 4, 5 or 6': never }) | undefined;
  /** Keeps every item from opening or closing. */
  disabled?: boolean | undefined;
  /** Layout only: margins, width, grid placement (`mt-6`). Appearance classes warn in development. */
  className?: string | undefined;
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. One item opens at a time by default; for several, pass `multiple`: `<Accordion multiple>`. */
  type?: { 'Use <Accordion multiple> for several open items; one at a time is the default': never };
  /** Not a prop. An open item always closes when its title is pressed again. */
  collapsible?: { 'Remove it: an open item always closes when pressed': never };
  /** Not a prop. Ouro UI uses `onValueChange`: `<Accordion onValueChange={(value) => …}>`. */
  onChange?: { 'Use <Accordion onValueChange={(value) => ...}>': never };
}

/** One item open at a time (the default). The value is the open item's, or `null` when all are closed. */
export type AccordionSingleProps = AccordionBaseProps & {
  /** Lets several items be open at once, and makes the value a list. */
  multiple?: false | undefined;
  /** The open item's value, or `null` for none, when you control it. Pair it with `onValueChange`. */
  value?: string | null | undefined;
  /** The item open first, when the component keeps its own state. @default none */
  defaultValue?: string | null | undefined;
  /** Called with the open item's value, or `null` when the person closes it. */
  onValueChange?: ((value: string | null) => void) | undefined;
};

/** Several items open at once. The value is the list of open items. */
export type AccordionMultipleProps = AccordionBaseProps & {
  /** Lets several items be open at once, and makes the value a list. */
  multiple: true;
  /** The open items' values, when you control them. Pair it with `onValueChange`. */
  value?: readonly string[] | undefined;
  /** The items open first, when the component keeps its own state. @default [] */
  defaultValue?: readonly string[] | undefined;
  /** Called with the open items' values whenever one opens or closes. */
  onValueChange?: ((value: string[]) => void) | undefined;
};

/** Props for {@link Accordion}. `multiple` switches the value from one string to a list. */
export type AccordionProps = AccordionSingleProps | AccordionMultipleProps;

/** A value in either mode, as Base UI's list. */
function toList(value: string | null | readonly string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  if (value === null) return [];
  return typeof value === "string" ? [value] : [...value];
}

const noSubscribe = () => () => {};

/**
 * Whether the browser reveals `hidden="until-found"` content for its page search
 * (Chromium does; WebKit does not, and would show the content). False on the server, so
 * hydration matches, and closed content stays in the server HTML either way.
 */
function useUntilFound(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => "onbeforematch" in document.body,
    () => false,
  );
}

function Chevron(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconClass}
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

/**
 * A stack of titles that each open their own content, for FAQs and long settings pages. One
 * item opens at a time unless you pass `multiple`. Panels grow to their measured height with
 * CSS, titles sit inside headings, closed content is in the server HTML and found by the
 * page search of browsers that support `hidden="until-found"`, and rows are 44px tall on touch screens.
 *
 * Use `Collapsible` instead for a single section that opens and closes. Use `Tabs` instead
 * when exactly one section always shows and the titles fit in a row.
 *
 * @group Lists
 * @see https://ourostack.github.io/ouro-ui/docs/accordion
 *
 * @example
 * <Accordion
 *   items={[
 *     { value: "storage", title: "How long does it keep?", content: "Three days in the fridge." },
 *     { value: "freeze", title: "Can I freeze it?", content: "Yes, for up to a month." },
 *   ]}
 * />
 * <Accordion multiple defaultValue={["storage"]} items={items} />
 */
export function Accordion(props: AccordionProps): JSX.Element {
  const {
    items,
    multiple,
    value,
    defaultValue,
    onValueChange,
    headingLevel: levelProp = 3,
    disabled,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    type,
    collapsible,
    onChange,
  } = props;
  // A level that is not one of Ouro UI's (a type error) warns and renders h3.
  const level = headingLevels.includes(levelProp as AccordionHeadingLevel) ? (levelProp as AccordionHeadingLevel) : 3;
  const values = items.map((item, index) => item.value ?? String(index));
  const duplicate = values.find((candidate, index) => values.indexOf(candidate) !== index);
  if (duplicate !== undefined) {
    // Two items with one value would open and close together.
    devThrow(
      "Accordion",
      `two items have the value "${duplicate}"`,
      process.env.NODE_ENV !== "production" ? "give each item its own value" : /* istanbul ignore next @preserve -- production only */ "",
    );
  }
  useAppearanceClassNameCheck(
    "Accordion",
    className,
    process.env.NODE_ENV !== "production" ? ownLook("Accordion") : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "Accordion",
    process.env.NODE_ENV !== "production"
      ? () => {
          const typeValue = type as unknown;
          return [
            typeValue !== undefined && [
              `type="${String(typeValue)}" is not a prop`,
              typeValue === "multiple" ? "<Accordion multiple>" : "<Accordion> (one item opens at a time by default)",
            ],
            collapsible !== undefined && ["collapsible is not a prop; an open item always closes when pressed", "<Accordion>"],
            onChange !== undefined && ["onChange is not a prop", "<Accordion onValueChange={(value) => …}>"],
            level !== levelProp && [
              `headingLevel={${String(levelProp)}} is not a heading level; use ${headingLevels.join(", ")}`,
              "<Accordion headingLevel={3}>",
            ],
            multiple === true &&
              typeof defaultValue === "string" && [
                "with multiple, defaultValue is a list",
                `<Accordion multiple defaultValue={["${defaultValue}"]}>`,
              ],
            multiple !== true &&
              Array.isArray(value) && ["value is a list, which needs multiple", `<Accordion multiple value={${JSON.stringify(value)}}>`],
          ];
        }
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  const Heading = `h${level}` as const;
  const untilFound = useUntilFound();
  return (
    <BaseAccordion.Root
      ref={ref}
      multiple={multiple === true}
      value={toList(value)}
      defaultValue={toList(defaultValue)}
      onValueChange={
        onValueChange
          ? (next: string[]) => {
              if (multiple === true) (onValueChange as (value: string[]) => void)(next);
              else (onValueChange as (value: string | null) => void)(next[0] ?? null);
            }
          : undefined
      }
      disabled={disabled}
      keepMounted
      hiddenUntilFound={untilFound}
      data-ouro="accordion"
      className={cn(rootClass, className)}
    >
      {items.map((item, index) => (
        <BaseAccordion.Item key={values[index]} value={values[index]} disabled={item.disabled === true} className={itemClass}>
          <BaseAccordion.Header render={<Heading />} className={headerClass}>
            <BaseAccordion.Trigger className={triggerClass}>
              {item.title}
              <Chevron />
            </BaseAccordion.Trigger>
          </BaseAccordion.Header>
          <BaseAccordion.Panel className={panelClass}>
            <div className={panelContentClass}>{item.content}</div>
          </BaseAccordion.Panel>
        </BaseAccordion.Item>
      ))}
    </BaseAccordion.Root>
  );
}
