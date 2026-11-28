import { Component, Suspense, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type JSX, type ReactNode, type RefObject } from "react";
import { pageDemos as demos } from "../docs/demos";
import { href } from "../routes";

/**
 * Whether an error is the browser failing to load a module, as an example's chunk fails once a deploy has replaced it
 * under an open page. Chromium, WebKit and Firefox each word it their own way, always as a TypeError.
 */
export function moduleLoadFailed(error: unknown): boolean {
  return error instanceof TypeError &&
    /^(Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module)\b/.test(error.message);
}

type BoundaryState = { failed: boolean; reason: string; stale: boolean };

class DemoBoundary extends Component<{ name: string; title: string; children: ReactNode }, BoundaryState> {
  override state = { failed: false, reason: "", stale: false };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { failed: true, reason: (error instanceof Error ? error.message : String(error)).replace(/\.$/, ""), stale: moduleLoadFailed(error) };
  }

  override render(): ReactNode {
    if (this.state.failed && this.state.stale) {
      // The page is older than the site: only a reload brings the new example, so say that, not the module's address.
      return (
        <div role="alert">
          <p>The {this.props.title} example did not load. The site may have just been updated.</p>
          <a href="" className="text-primary underline underline-offset-4">Reload the page</a>
        </div>
      );
    }
    if (this.state.failed) {
      const known = Object.hasOwn(demos, this.props.name);
      return (
        <div role="alert">
          <p>
            The {this.props.title} example stopped with this error: {this.state.reason}. Reload the page to try again, or read the docs.
          </p>
          <a href={href(known ? `/docs/${this.props.name}/` : "/docs/")} className="text-primary underline underline-offset-4">
            {known ? `Read the ${this.props.title} docs` : "Browse component docs"}
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}

const noClientUpdates = () => () => undefined;

function SelectedDemo({ name, title }: { name: string; title: string }): JSX.Element {
  // Hydrated a render after the example's own chunk arrives. Until then a tap or text there is kept and answered then
  // (early-input.ts), so the example is never shown disabled. Other keys in that moment (arrows on a slider or tabs,
  // Escape) do nothing: shown greyed out, the whole example would read as broken for the many who only tap.
  const hydrated = useSyncExternalStore(noClientUpdates, () => true, () => false);
  const root = useRef<HTMLDivElement>(null);
  // Live: the controls are enabled and, since a parent's effects run after its children's, every
  // handler the example attaches in an effect is attached. Tests wait for this, then press once.
  useEffect(() => {
    if (hydrated) root.current?.setAttribute("data-site-demo-ready", "");
  }, [hydrated]);
  const Demo = Object.hasOwn(demos, name) ? demos[name] : undefined;
  if (!Demo) throw new Error(`Unknown live example "${name}"`);
  return (
    <div ref={root} data-site-demo={name} className="flex w-full justify-center">
      <fieldset aria-label={`${title} example`} className="m-0 flex w-full min-w-0 [min-inline-size:0] justify-center border-0 p-0">
        <Demo />
      </fieldset>
    </div>
  );
}

/** A single lazy example; React focus events also track its portal descendants. */
export function LiveDemo({
  name,
  title,
  returnFocus,
}: {
  name: string;
  title: string;
  returnFocus?: RefObject<HTMLButtonElement | null>;
}): JSX.Element {
  const focused = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => () => {
    const owned = focused.current;
    if (!owned || !returnFocus) return;
    const wasFocused = document.activeElement === owned;
    queueMicrotask(() => {
      const active = document.activeElement;
      if (returnFocus.current?.isConnected &&
        (active === owned || (active === document.body && (wasFocused || !owned.isConnected)))) {
        returnFocus.current.focus();
      }
    });
  }, [returnFocus]);
  return (
    <div
      className="w-full"
      onFocusCapture={(event) => { focused.current = event.target; }}
      onBlurCapture={() => { focused.current = null; }}
    >
      <DemoBoundary key={name} name={name} title={title}>
        <Suspense fallback={<p role="status" data-site-demo-loading="">Loading {title} example...</p>}>
          <SelectedDemo name={name} title={title} />
        </Suspense>
      </DemoBoundary>
    </div>
  );
}
