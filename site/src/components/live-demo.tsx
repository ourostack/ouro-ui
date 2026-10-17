import { Component, Suspense, useLayoutEffect, useRef, useSyncExternalStore, type JSX, type ReactNode, type RefObject } from "react";
import { demos } from "../docs/demos";
import { href } from "../routes";

class DemoBoundary extends Component<{ name: string; title: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    if (this.state.failed) {
      const known = Object.hasOwn(demos, this.props.name);
      return (
        <div role="alert">
          <p>Could not load the {this.props.title} example.</p>
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
  // The server snapshot also keeps the first hydration render disabled.
  const hydrated = useSyncExternalStore(noClientUpdates, () => true, () => false);
  const Demo = Object.hasOwn(demos, name) ? demos[name] : undefined;
  if (!Demo) throw new Error(`No live example for "${name}"`);
  return (
    <div data-site-demo={name} className="flex w-full justify-center">
      <fieldset disabled={!hydrated} aria-label={`${title} example`} className="m-0 flex w-full min-w-0 [min-inline-size:0] justify-center border-0 p-0">
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
