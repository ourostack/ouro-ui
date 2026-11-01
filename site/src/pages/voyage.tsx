// First, so the page's own rules below come after Tailwind's and win.
import "../voyage/voyage-tailwind.css";
import { Suspense, useEffect, useState, useSyncExternalStore, type JSX } from "react";
import { Inspector } from "@/registry/ouro/components/ouro/inspector/inspector";
import { Toaster } from "@/registry/ouro/components/ouro/toast/toaster";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";
import { Popups, PopupsProvider } from "../components/popups";
import { HydrateInTurn } from "../hydrate";
import { href, normalizePath } from "../paths";
import { ChapterOneIsland, ChapterThreeIsland, ChapterTwoIsland, HomeReferenceIsland } from "../voyage/chapters/island";
import { useEggs } from "../voyage/eggs/listen";
import { VoyageHeader } from "../voyage/header";
import { TwoShips } from "../voyage/home";
import { Hero } from "../voyage/hero";
import { VoyageFooter } from "../voyage/layout";
import { StoryOpening } from "../voyage/nautilus";
import { Repaint } from "../voyage/repaint";
import { openXray, setXray, spotlightFrom, useXray } from "../voyage/xray-store";
import "../themes/presets.generated.css";
import "../themes/by-preset.css";
import "../voyage/voyage.css";
import "../voyage/chapters/chapters.css";

const docsHref = (item: string) => href(`/docs/${item}/`);

/**
 * X-ray: HX Inspector over the page. It opens a beat after the press has painted (two animation
 * frames, then INSPECTOR_AFTER_PRESS_MS), because it measures every HX component on the page, so the
 * Switch or the button answers first and the Inspector follows; it closes at once. Two frames say
 * the press's frame was painted, not shown: where the compositor ran behind the page, the
 * Inspector's frame was shown together with the press's and held its answer back.
 */
/** How long after the press's paint the Inspector opens: long enough for a frame the compositor is behind on to be shown first. */
const INSPECTOR_AFTER_PRESS_MS = 100;

function Xray(): JSX.Element {
  const on = useXray();
  const spotlight = useSpotlight();
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    if (!on) return;
    let timer: number | undefined;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        timer = window.setTimeout(() => setPainted(true), INSPECTOR_AFTER_PRESS_MS);
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      setPainted(false);
    };
  }, [on]);
  return <Inspector open={on && painted} onOpenChange={setXray} docsHref={docsHref} spotlight={spotlight} />;
}

/** X-ray on at load when the address asks for it (`?xray`), as the home page's "X-ray it" link does. */
function useXrayFromAddress(): void {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("xray")) setXray(true);
  }, []);
}

/**
 * The component the address names for X-ray to point out (`?xray=Switch`), as each docs page's
 * links do, or `undefined`. The address stays put while the page is open, and the server has none.
 * Only X-ray reads it: a page that re-rendered with it as it hydrates would drop the server's HTML
 * of a chapter still waiting to hydrate.
 */
function useSpotlight(): string | undefined {
  return useSyncExternalStore(
    noSubscription,
    () => spotlightFrom(window.location.search),
    () => undefined,
  );
}

const noSubscription = () => () => {};

/**
 * The voyage pages ("Mobilis in mobili", site-design.md), one chunk and stylesheet: the home page
 * (the porthole stage, the two ships, the themes, agents and install) and the Nautilus's own page
 * (the story's opening, its chapters, then Chapter I).
 */
export default function VoyagePage({ path }: { path: string }): JSX.Element {
  const nautilus = normalizePath(path) === "/nautilus/";
  useXrayFromAddress();
  useEggs(nautilus);
  // Leaving the page turns X-ray off, so the next page starts without it.
  useEffect(() => () => setXray(false), []);
  return (
    <OuroProvider>
      <PopupsProvider>
        {/* Each boundary hydrates as its own task, so no single task blocks a tap for long. */}
        <div className="voyage min-h-dvh bg-background text-foreground">
          <Suspense>
            <VoyageHeader path={nautilus ? "/nautilus/" : "/"} />
          </Suspense>
          {nautilus ? (
            <main>
              <StoryOpening />
              <ChapterOneIsland />
              <ChapterTwoIsland />
              <ChapterThreeIsland />
              <Popups />
            </main>
          ) : (
            <main>
              <Hero onXray={openXray} />
              <TwoShips />
              <HydrateInTurn name="themes">
                <Repaint />
              </HydrateInTurn>
              <HomeReferenceIsland />
              <Popups />
            </main>
          )}
          <HydrateInTurn name="footer">
            <VoyageFooter />
          </HydrateInTurn>
        </div>
        <Xray />
        <Toaster />
      </PopupsProvider>
    </OuroProvider>
  );
}
