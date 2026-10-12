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
 * bottom of the screen, full width on phones; they pause while the pointer is over them
 * or a toast has focus, F6 moves focus to them, and a swipe down or sideways dismisses
 * one. Each toast is read to screen readers once, politely, through this region.
 *
 * Use `Alert` instead for a message that stays on the page, and `Dialog` when the user
 * must answer before going on.
 *
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
  const [duplicate, setDuplicate] = useState(false);
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
  if (duplicate) return null;
  return (
    <Toast.Provider limit={3}>
      <Connect onDuplicate={setDuplicate} />
      <Toast.Portal className={portalClass}>
        <Toast.Viewport aria-label={label} data-ouro="toaster" className={viewportClass}>
          <ToastList closeLabel={closeLabel} />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

/** Connects this Toaster to `toast()`, or reports that another one already is. */
function Connect({ onDuplicate }: { onDuplicate: (duplicate: true) => void }): null {
  const { add, close } = Toast.useToastManager();
  const key = useRef({});
  useEffect(() => {
    const disconnect = connectToaster({
      add: (record: ToastRecord) => {
        add({
          id: record.id,
          title: record.message,
          description: record.description,
          type: record.tone,
          timeout: record.timeout,
          priority: "low",
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
      },
      close,
    });
    if (disconnect) return disconnect;
    /* istanbul ignore else @preserve -- the else path exists only in production bundles; scripts/dev-strip.test.mjs covers it */
    if (process.env.NODE_ENV !== "production") {
      devWarn(
        "Toaster",
        "another <Toaster /> is already mounted, so this one shows nothing",
        "render <Toaster /> once, at the root of your app",
        key.current,
      );
    }
    onDuplicate(true);
    return undefined;
  }, [add, close, onDuplicate]);
  return null;
}

/** The toasts, oldest first in the page, so a screen reader reads them in the order they came. */
function ToastList({ closeLabel }: { closeLabel: string }): JSX.Element[] {
  const { toasts } = Toast.useToastManager();
  return [...toasts].reverse().map((item) => (
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
