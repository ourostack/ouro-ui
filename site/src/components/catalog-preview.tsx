import { Component, startTransition, Suspense, useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { demos } from "../docs/demos";

// The components index draws each component small, beside its name: its own live demo, scaled down, so the catalog shows
// what each one looks like before you open it. The server draws the empty frames only, so nothing moves when one fills.

/**
 * The demos that don't make a preview: one that mounts something for the whole page (a toast region, a bar fixed to the
 * screen, X-ray), keeps time or sound going while it is drawn (a timer, a meter), or shows nothing until it is used.
 */
export const NO_PREVIEW: ReadonlySet<string> = new Set([
  "inspector",
  "toaster",
  "swipe-actions",
  "install-prompt",
  "route-progress",
  "tab-bar",
  "level-meter",
  "live-captions",
  "timer",
  "timer-tray",
  "moment",
  "sync-status",
  "skip-link",
]);

/** How far from the screen a frame starts to fill: about a screen ahead, so a preview is drawn by the time it is seen. */
const AHEAD = "600px 0px";

/** Previews waiting to be drawn, one at a time when the browser is idle, so scrolling never waits on one. */
const waiting: Array<() => void> = [];
let drawing = false;

function next(): void {
  const draw = waiting.shift();
  if (!draw) {
    drawing = false;
    return;
  }
  const later = (run: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(run, { timeout: 400 }) : setTimeout(run, 32));
  later(() => {
    draw();
    next();
  });
}

function queue(draw: () => void): void {
  waiting.push(draw);
  if (drawing) return;
  drawing = true;
  next();
}

/** A preview that fails to load or render leaves its frame empty: the row still says what the component is. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * One component's preview: its live demo, drawn at a third of its size or so in a frame beside its name on the components
 * index. It is a picture of the component, so it is hidden from screen readers and takes no focus or press (`inert`); the
 * row's link covers it. It fills as it nears the screen, and then stays.
 */
export function CatalogPreview({ name }: { name: string }): JSX.Element {
  const frame = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const Demo = Object.hasOwn(demos, name) && !NO_PREVIEW.has(name) ? demos[name] : undefined;
  useEffect(() => {
    const element = frame.current;
    if (!element || !Demo) return;
    let gone = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        // A transition, so React draws it in slices between frames.
        queue(() => {
          if (!gone) startTransition(() => setShown(true));
        });
      },
      { rootMargin: AHEAD },
    );
    observer.observe(element);
    return () => {
      gone = true;
      observer.disconnect();
    };
  }, [Demo]);
  return (
    <div
      ref={frame}
      aria-hidden="true"
      inert
      data-site-preview={name}
      className="relative flex h-20 w-30 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/50 select-none sm:h-24 sm:w-36 dark:bg-muted/65"
    >
      {shown && Demo && (
        <Quiet>
          <Suspense fallback={null}>
            {/* Drawn at 360 by 240 and scaled to the frame. It fades in, which reduced motion keeps, shorter, as a fade moves nothing. */}
            <div className="flex h-60 w-90 flex-none scale-[0.3333] items-center-safe justify-center p-4 transition-opacity duration-(--ouro-duration-slow) starting:opacity-0 motion-reduce:duration-(--ouro-duration-fast) sm:scale-40">
              <Demo />
            </div>
          </Suspense>
        </Quiet>
      )}
    </div>
  );
}
