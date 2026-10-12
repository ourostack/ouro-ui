import type { ReactNode } from "react";
import { devWarn } from "@/registry/ouro/lib/ouro/dev";
import type { ToneName } from "@/registry/ouro/lib/ouro/tones";

/** A button in a toast: `{ label: "Undo", onClick: undo }`. Pressing it runs `onClick`, then dismisses the toast. */
export interface ToastAction {
  /** The button's text: a short verb, such as "Undo" or "View". */
  label: string;
  /** Runs when the button is pressed, before the toast is dismissed. */
  onClick: () => void;
}

/** Options for {@link toast}. */
export interface ToastOptions {
  /**
   * Color role from the theme, named after its token, shown as an icon: `success` for
   * a check, `warning` and `destructive` for a problem, `primary` for information.
   * `secondary`, the default, has no icon. Sonner's `error` is `destructive` and its
   * `info` is `primary`.
   * @default "secondary"
   */
  tone?:
    | "primary"
    | "secondary"
    | "destructive"
    | "success"
    | "warning"
    | (string & { 'error is "destructive"; info is "primary"; danger is "destructive"': never })
    | undefined;
  /** A second line under the message. */
  description?: ReactNode;
  /** A button in the toast, such as Undo: `{ label: "Undo", onClick: undo }`. Pressing it dismisses the toast. */
  action?: ToastAction | undefined;
  /**
   * How long the toast stays, in milliseconds. Hovering or focusing the toasts pauses
   * the countdown. `0` or `Infinity` keeps it until it is dismissed.
   * @default 5000
   */
  duration?: number | undefined;
  /** An id of your own. A toast with the id of one still showing replaces it in place. */
  id?: string | undefined;

  /** Not an option. Ouro UI uses `tone`: `toast("Saved", { tone: "success" })`. */
  type?: { 'Use toast("Saved", { tone: "success" })': never };
  /** Not an option. Ouro UI uses `tone`: `toast("Saved", { tone: "success" })`. */
  variant?: { 'Use toast("Saved", { tone: "success" })': never };
  /** Not an option. Ouro UI uses `duration`, in milliseconds: `toast("Saved", { duration: 8000 })`. */
  timeout?: { 'Use toast("Saved", { duration: 8000 })': never };
  /** Not an option. The message is the first argument: `toast("Saved", { description: "…" })`. */
  title?: { 'The message is the first argument: toast("Saved")': never };
}

/**
 * A toast as the Toaster receives it.
 *
 * @internal
 */
export interface ToastRecord {
  id: string;
  message: string;
  tone: ToneName;
  description: ReactNode;
  action: ToastAction | undefined;
  /** Milliseconds; 0 keeps the toast until it is dismissed. */
  timeout: number;
}

/**
 * Where `toast()` sends toasts: the mounted Toaster.
 *
 * @internal
 */
export interface ToasterSink {
  add(record: ToastRecord): void;
  close(id?: string): void;
}

const tones: readonly ToneName[] = ["primary", "secondary", "destructive", "success", "warning"];
/** Tone names from Sonner and other libraries, with the tone to use. */
const renamed: Readonly<Record<string, ToneName>> = { error: "destructive", danger: "destructive", info: "primary" };

/** How many toasts wait for a Toaster before the oldest is dropped. */
const MAX_PENDING = 20;
/** How long a toast may wait for a Toaster before development warns that none is mounted. */
const MISSING_TOASTER_MS = 1000;

let sink: ToasterSink | undefined;
let pending: ToastRecord[] = [];
let count = 0;
let missingCheck: ReturnType<typeof setTimeout> | undefined;

/**
 * Shows a toast: a short message that appears at the bottom of the screen, is read to
 * screen readers once, and dismisses itself. Call it from anywhere, such as an event
 * handler or an action's result, after rendering `<Toaster />` once. Returns the toast's
 * id; `toast.dismiss(id)` closes it, and `toast.dismiss()` closes them all.
 *
 * A toast called before the Toaster mounts waits for it. Up to three show at once, the
 * newest in front; hovering or focusing them (or pressing F6) pauses the countdown, and a
 * swipe down or sideways dismisses one.
 *
 * Use `Alert` instead when the message must stay on the page, such as a form's errors,
 * and `Dialog` when the user must answer before going on.
 *
 * @see https://ourostack.github.io/ouro-ui/docs/toaster
 *
 * @example
 * toast("Recipe saved", { tone: "success" });
 * toast("Recipe deleted", { action: { label: "Undo", onClick: restore } });
 * toast("Couldn't save", { tone: "destructive", description: "Check your connection." });
 */
export function toast(message: string, options: ToastOptions = {}): string {
  const { tone: toneOption = "secondary", description, action, duration = 5000, id = `ouro-toast-${++count}` } = options;
  const tone = tones.includes(toneOption as ToneName) ? (toneOption as ToneName) : "secondary";
  /* istanbul ignore else @preserve -- the else path exists only in production bundles; scripts/dev-strip.test.mjs covers it */
  if (process.env.NODE_ENV !== "production") {
    const bad = options as { type?: unknown; variant?: unknown; timeout?: unknown; title?: unknown };
    if (tone !== toneOption) {
      const name = String(toneOption);
      const fix = Object.hasOwn(renamed, name) ? renamed[name]! : "secondary";
      devWarn("toast", `tone: "${name}" is not a tone; use ${tones.map((item) => `"${item}"`).join(", ")}`, `toast("…", { tone: "${fix}" })`);
    }
    for (const key of ["type", "variant"] as const) {
      if (bad[key] !== undefined) devWarn("toast", `${key} is not an option`, `toast("…", { tone: "${toneFix(bad[key])}" })`);
    }
    if (bad.timeout !== undefined) devWarn("toast", "timeout is not an option", `toast("…", { duration: ${String(bad.timeout)} })`);
    if (bad.title !== undefined) devWarn("toast", "title is not an option; the message is the first argument", `toast(${JSON.stringify(String(bad.title))})`);
  }
  // A toast is for the person using the page; on the server there is no one to show it to,
  // and a module-level queue there would be shared between requests.
  /* istanbul ignore if @preserve -- server only */
  if (typeof window === "undefined") return id;
  const record: ToastRecord = {
    id,
    message,
    tone,
    description,
    action,
    timeout: duration === Infinity || duration < 0 ? 0 : duration,
  };
  if (sink) {
    sink.add(record);
  } else {
    pending = [...pending.filter((item) => item.id !== id), record].slice(-MAX_PENDING);
    /* istanbul ignore else @preserve -- the else path exists only in production bundles; scripts/dev-strip.test.mjs covers it */
    if (process.env.NODE_ENV !== "production") scheduleMissingCheck();
  }
  return id;
}

/** The tone a Sonner-style `type` or `variant` value means, for a development message. */
function toneFix(value: unknown): ToneName {
  const name = String(value);
  if (tones.includes(name as ToneName)) return name as ToneName;
  return Object.hasOwn(renamed, name) ? renamed[name]! : "secondary";
}

function scheduleMissingCheck(): void {
  if (missingCheck !== undefined) return;
  missingCheck = setTimeout(() => {
    missingCheck = undefined;
    const first = pending[0];
    if (!sink && first) {
      devWarn("toast", `no <Toaster /> is mounted, so "${first.message}" is not shown`, "render <Toaster /> once, at the root of your app");
    }
  }, MISSING_TOASTER_MS);
}

/**
 * Closes the toast with this id, or every toast with no id.
 */
toast.dismiss = function dismiss(id?: string): void {
  if (sink) sink.close(id);
  else pending = id === undefined ? [] : pending.filter((item) => item.id !== id);
};

/** A Sonner shortcut: it works, and warns in development with the Ouro UI call. */
function sonnerAlias(name: string, tone: ToneName) {
  return (message: string, options: ToastOptions = {}): string => {
    /* istanbul ignore else @preserve -- the else path exists only in production bundles; scripts/dev-strip.test.mjs covers it */
    if (process.env.NODE_ENV !== "production") {
      devWarn("toast", `toast.${name} is not a function`, `toast(${JSON.stringify(message)}, { tone: "${tone}" })`);
    }
    return toast(message, { ...options, tone });
  };
}

// Sonner's shortcuts are type errors whose message names the call to use. At run time they
// still show the toast and warn in development.
toast.success = sonnerAlias("success", "success") as unknown as { 'Use toast("Saved", { tone: "success" })': never };
toast.error = sonnerAlias("error", "destructive") as unknown as { 'Use toast("Failed", { tone: "destructive" })': never };
toast.warning = sonnerAlias("warning", "warning") as unknown as { 'Use toast("Careful", { tone: "warning" })': never };
toast.info = sonnerAlias("info", "primary") as unknown as { 'Use toast("Heads up", { tone: "primary" })': never };

/**
 * Connects a mounted Toaster: toasts that waited for it show now, and later ones go to
 * it. Returns the disconnect function, or `undefined` when another Toaster is already
 * connected (only one shows toasts, so each is announced once).
 *
 * @internal
 */
export function connectToaster(next: ToasterSink): (() => void) | undefined {
  if (sink) return undefined;
  sink = next;
  const waiting = pending;
  pending = [];
  for (const record of waiting) next.add(record);
  return () => {
    sink = undefined;
  };
}
