import { lazy, Suspense, useState, useSyncExternalStore, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { docsItems } from "../docs/items";
import { href } from "../paths";
import { LiveDemo } from "./live-demo";
import { PhoneStatus } from "./phone-status";

// A component page's live demo can show itself on a phone: the demo-only page (/docs/demo/?name=…) in a frame a phone's
// width, so its media queries see a phone and the component lays out as it does on one (a Dialog comes up as a sheet).

/** The demos whose layout changes on a phone's width alone, so the frame shows something a wide window can't. */
export const PHONE_DEMOS: readonly string[] = ["dialog", "edit-sheet", "confirm-dialog", "menu", "command", "popover", "emoji-picker", "navbar", "sidebar-layout", "pagination", "toaster"];

/** The demo-only page's address for a component. */
export const demoAddress = (name: string): string => `${href("/docs/demo/")}?name=${encodeURIComponent(name)}`;

const noUpdates = () => () => undefined;

/** The looks under the demo, a chunk of their own that loads once the page answers: the server draws only their room. */
const DemoLooks = lazy(() => import("./demo-looks"));

/**
 * The looks, once the page has hydrated. Its own component, so the render that follows hydration is this one alone: a
 * render of DemoStage then would reach the demo's Suspense boundary while its chunk is still loading, and React would
 * drop the server's HTML for the loading line.
 */
function LooksOnceHydrated(): JSX.Element | null {
  const hydrated = useSyncExternalStore(noUpdates, () => true, () => false);
  return hydrated ? (
    <Suspense fallback={null}>
      <DemoLooks />
    </Suspense>
  ) : null;
}

/** A component page's live demo, with a Phone button where the phone's layout differs: pressed, the demo shows in a phone's frame. */
export function DemoStage({ name, title }: { name: string; title: string }): JSX.Element {
  const [phone, setPhone] = useState(false);
  const phoneable = PHONE_DEMOS.includes(name);
  return (
    <section
      aria-label="Live demo"
      className={`relative flex min-h-48 items-center justify-center rounded-3xl border border-transparent bg-muted/50 px-5 pt-10 pb-20 lg:px-10 dark:bg-muted/65 [--ouro-scroller-surface:var(--accent)] ${phoneable ? "sm:pt-16" : ""}`}
    >
      {phoneable && (
        // A phone's own screen is already one, so the button shows from 640px up. 24px in from the box's edge (with its
        // 1px border), so its corner nests in the box's: 40px less 24px is the button's own 16px.
        <Button variant="outline" tone="secondary" size="sm" aria-pressed={phone} onClick={() => setPhone(!phone)} className="absolute end-[23px] top-[23px] max-sm:hidden" data-site-phone="">
          Phone
        </Button>
      )}
      {phone ? (
        // The phone's case around its screen: the status bar, with the reader's time and sky, over the demo's page.
        <div data-site-phone-frame="" className="max-w-full overflow-hidden rounded-[2.5rem] border-8 border-foreground bg-background dark:border-secondary">
          <PhoneStatus />
          <iframe title={`${title} on a phone`} src={demoAddress(name)} width={390} height={688} className="block max-w-full" />
        </div>
      ) : (
        <LiveDemo name={name} title={title} />
      )}
      {/* In the room the box keeps at its foot (pb-20), centred, away from its corners: nothing moves when it arrives. */}
      <div className="absolute inset-x-0 bottom-4 flex justify-center">
        <LooksOnceHydrated />
      </div>
    </section>
  );
}

/** The demo-only page: one component's live demo and nothing else, named by `?name=`, for the phone frame. */
export function DemoFrame(): JSX.Element {
  // The server renders one page for every name, so the name is read once in the browser (undefined until then).
  const name = useSyncExternalStore<string | null | undefined>(noUpdates, () => new URLSearchParams(location.search).get("name"), () => undefined);
  const item = docsItems.find((entry) => entry.name === name);
  return (
    <main className="grid min-h-dvh place-items-center p-4" data-site-demo-page="">
      <h1 className="sr-only">{item ? `${item.title} live demo` : "Live demo"}</h1>
      {name === undefined ? (
        <p role="status" className="m-0 text-sm text-muted-foreground">
          Loading the demo…
        </p>
      ) : item ? (
        <LiveDemo name={item.name} title={item.title} />
      ) : (
        // An address with no component, or one with no page: say what this page is for, and offer the ones it shows best.
        <nav aria-label="Demos on a phone" className="grid max-w-sm gap-3 text-center">
          <p className="m-0 text-muted-foreground">This page shows one component's live demo. Pick one to see it here:</p>
          <ul className="m-0 flex list-none flex-wrap justify-center gap-x-4 gap-y-2 p-0">
            {PHONE_DEMOS.map((demo) => (
              <li key={demo}>
                <a href={demoAddress(demo)} className="text-primary underline underline-offset-4">
                  {docsItems.find((entry) => entry.name === demo)?.title ?? demo}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </main>
  );
}
