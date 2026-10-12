"use client";

import { Toast } from "@base-ui/react/toast";
import { useEffect, useRef, useState, type JSX } from "react";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { devWarn } from "@/registry/ouro/lib/ouro/dev";
import { connectToaster, type ToastRecord } from "@/registry/ouro/lib/ouro/toast";
import { TouchTarget } from "@/registry/ouro/lib/ouro/touch-target";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import {
  actionClass,
  closeClass,
  contentClass,
  iconTones,
  portalClass,
  rootClass,
  swipeDirections,
  viewportClass,
} from "@/registry/ouro/components/ouro/toast/toaster-styles";

/** Props for {@link Toaster}. */
export interface ToasterProps {
  /**
   * The name screen readers give the region the toasts appear in. Translate it with the
   * rest of your interface.
   * @default "Notifications"
   */
  label?: string | undefined;
  /**
   * The accessible name of each toast's dismiss button, which shows an icon only.
   * @default "Dismiss"
   */
  closeLabel?: string | undefined;

  /** Not a prop. Toasts show at the bottom: full width on phones, at the bottom end from `sm`. */
  position?: { 'Not a prop: toasts show at the bottom. Use <Toaster />': never };
  /** Not a prop. Each toast takes its own `tone`: `toast("Saved", { tone: "success" })`. */
  richColors?: { 'Use toast("Saved", { tone: "success" })': never };
  /** Not a prop. Dark mode follows the `.dark` class, as in shadcn. */
  theme?: { 'Not a prop: dark mode follows the .dark class. Use <Toaster />': never };
  /** Not a prop. Each toast takes its own `duration`: `toast("Saved", { duration: 8000 })`. */
  duration?: { 'Use toast("Saved", { duration: 8000 })': never };
}

/**
 * Shows the toasts you send with `toast("Saved")` from `@/lib/ouro/toast`: render it
 * once, at the root of your app, inside `OuroProvider` if you use one, or alone. Every
 * Ouro UI install has `toast`. Toasts stack at the
 * bottom of the screen, full width on phones; up to three show, and later ones wait their
 * turn. They pause while the pointer is over them or a toast has focus, F6 moves focus to
 * them, newest first, and a swipe down or sideways dismisses one. Each toast is read to
 * screen readers once: politely through this region, and a `destructive` toast
 * assertively, so it interrupts.
 *
 * Render one Toaster. A second one warns in development and shows nothing until the
 * first unmounts, then takes over.
 *
 * Use `Alert` instead for a message that stays on the page, and `Dialog` when the user
 * must answer before going on.
 *
 * @group Feedback
 * @see https://ourostack.github.io/ouro-ui/docs/toaster
 *
 * @example
 * <OuroProvider>
 *   <App />
 *   <Toaster />
 * </OuroProvider>
 * // Anywhere in the app:
 * toast("Recipe saved", { tone: "success" });
 */
export function Toaster(props: ToasterProps): JSX.Element | null {
  const { label = "Notifications", closeLabel = "Dismiss", position, richColors, theme, duration } = props;
  const [active, setActive] = useState(false);
  useDevWarnings(
    "Toaster",
    process.env.NODE_ENV !== "production"
      ? () => [
          position !== undefined && ["position is not a prop; toasts show at the bottom, full width on phones", "<Toaster />"],
          richColors !== undefined && ["richColors is not a prop", 'toast("Saved", { tone: "success" })'],
          theme !== undefined && ["theme is not a prop; dark mode follows the .dark class", "<Toaster />"],
          duration !== undefined && ["duration is not a prop", `toast("Saved", { duration: ${String(duration)} })`],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return (
    <Toast.Provider limit={VISIBLE}>
      <Connect onActive={setActive} />
      {active && (
        <Toast.Portal className={portalClass}>
          <Toast.Viewport aria-label={label} data-ouro="toaster" className={viewportClass}>
            <ToastList closeLabel={closeLabel} />
          </Toast.Viewport>
        </Toast.Portal>
      )}
    </Toast.Provider>
  );
}

/** How many toasts show at once; later ones wait in the Toaster's queue. */
const VISIBLE = 3;

/**
 * Connects this Toaster to `toast()`. Up to three toasts are in Base UI's manager at a time;
 * later ones wait here, first in first out, and are added, with their countdown, when a
 * slot frees. Another Toaster already connected keeps this one waiting until it unmounts.
 */
function Connect({ onActive }: { onActive: (active: boolean) => void }): null {
  // add and close are the store's own methods, stable for the Toaster's life. The queue
  // lives as long as the Toaster too, across StrictMode's second effect run.
  const { add, close } = Toast.useToastManager();
  const state = useRef({ shown: new Set<string>(), queue: [] as ToastRecord[] });
  const key = useRef({});
  useEffect(() => {
    const { shown } = state.current;
    const next = () => {
      while (shown.size < VISIBLE && state.current.queue.length > 0) {
        const [record, ...rest] = state.current.queue;
        state.current.queue = rest;
        show(record!);
      }
    };
    const show = (record: ToastRecord) => {
      shown.add(record.id);
      add({
        id: record.id,
        title: record.message,
        description: record.description,
        type: record.tone,
        timeout: record.timeout,
        // A destructive toast interrupts: Base UI speaks it through an alert and hides it from the polite region.
        priority: record.tone === "destructive" ? "high" : "low",
        onRemove: () => {
          shown.delete(record.id);
          // Base UI removes the toast by its index after this call returns, so adding the
          // next one here would shift the list under it; add it once the removal is done.
          queueMicrotask(next);
        },
        actionProps: record.action
          ? {
              children: (
                <>
                  <TouchTarget />
                  {record.action.label}
                </>
              ),
              onClick: () => {
                record.action!.onClick();
                close(record.id);
              },
            }
          : undefined,
      });
    };
    const { disconnect, active } = connectToaster({
      add: (record) => {
        const { queue } = state.current;
        if (shown.has(record.id)) show(record);
        else if (queue.some((item) => item.id === record.id)) state.current.queue = queue.map((item) => (item.id === record.id ? record : item));
        else {
          state.current.queue = [...queue, record];
          next();
        }
      },
      close: (id) => {
        state.current.queue = id === undefined ? [] : state.current.queue.filter((item) => item.id !== id);
        if (id === undefined || shown.has(id)) close(id);
      },
      activate: () => onActive(true),
    });
    /* istanbul ignore else @preserve -- the else path exists only in production bundles; scripts/dev-strip.test.mjs covers it */
    if (!active && process.env.NODE_ENV !== "production") {
      devWarn(
        "Toaster",
        "another <Toaster /> is already mounted, so this one shows toasts only after that one unmounts",
        "render <Toaster /> once, at the root of your app",
        key.current,
      );
    }
    return () => {
      disconnect();
      onActive(false);
    };
  }, [add, close, onActive]);
  return null;
}

/**
 * The toasts, newest first in the page as Base UI orders them, so F6 then Tab reaches the
 * newest and goes on to each older one. Each is announced as it arrives.
 */
function ToastList({ closeLabel }: { closeLabel: string }): JSX.Element[] {
  const { toasts } = Toast.useToastManager();
  return toasts.map((item) => (
    <Toast.Root
      key={item.id}
      toast={item}
      swipeDirection={swipeDirections}
      data-ouro="toast"
      data-tone={item.type}
      className={rootClass}
    >
      <Toast.Content className={contentClass}>
        <ToneIcon tone={item.type} />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <Toast.Title render={<div />} data-ouro-toast-title="" className="m-0 text-sm font-medium text-popover-foreground" />
          <Toast.Description render={<div />} data-ouro-toast-description="" className="m-0 text-sm text-muted-foreground" />
        </div>
        <Toast.Action className={actionClass} />
        <Toast.Close aria-label={closeLabel} className={closeClass}>
          <TouchTarget />
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="size-4">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}

/** The tone's icon, drawn in the tone's color; `secondary` has none. */
function ToneIcon({ tone }: { tone: string | undefined }): JSX.Element | null {
  if (tone === undefined || !Object.hasOwn(iconTones, tone)) return null;
  const color = iconTones[tone as keyof typeof iconTones];
  return (
    <svg
      aria-hidden="true"
      data-ouro-toast-icon=""
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("mt-px size-5 shrink-0", color)}
    >
      {tone === "success" && (
        <>
          <circle cx="10" cy="10" r="8" />
          <path d="M6.5 10.25l2.25 2.25 4.75-5" />
        </>
      )}
      {tone === "warning" && (
        <>
          <path d="M10 2.75 1.75 17.25h16.5Z" />
          <path d="M10 8v4M10 14.75v.01" />
        </>
      )}
      {tone === "destructive" && (
        <>
          <circle cx="10" cy="10" r="8" />
          <path d="M10 6v4.5M10 13.75v.01" />
        </>
      )}
      {tone === "primary" && (
        <>
          <circle cx="10" cy="10" r="8" />
          <path d="M10 9v5M10 6.25v.01" />
        </>
      )}
    </svg>
  );
}
