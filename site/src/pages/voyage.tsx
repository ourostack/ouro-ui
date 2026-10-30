// First, so the page's own rules below come after Tailwind's and win.
import "../voyage/voyage-tailwind.css";
import { Suspense, useEffect, useState, type JSX } from "react";
import { Inspector } from "@/registry/ouro/components/ouro/inspector/inspector";
import { Toaster } from "@/registry/ouro/components/ouro/toast/toaster";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";
import { Popups, PopupsProvider } from "../components/popups";
import { href, normalizePath } from "../paths";
import { ChapterOneIsland, ChapterThreeIsland, ChapterTwoIsland, HomeReferenceIsland } from "../voyage/chapters/island";
import { useEggs } from "../voyage/eggs/listen";
import { VoyageHeader } from "../voyage/header";
import { TwoShips } from "../voyage/home";
import { Hero } from "../voyage/hero";
import { VoyageFooter } from "../voyage/layout";
import { StoryOpening } from "../voyage/nautilus";
import { Repaint } from "../voyage/repaint";
import { openXray, setXray, useXray } from "../voyage/xray-store";
import "../themes/presets.generated.css";
import "../themes/by-preset.css";
import "../voyage/voyage.css";
import "../voyage/chapters/chapters.css";

const docsHref = (item: string) => href(`/docs/${item}/`);

/**
 * X-ray: HX Inspector over the page. It opens in the frame after the press has painted (two
 * animation frames), because it measures every HX component on the page, so the Switch or the
 * button answers first; it closes at once.
 */
function Xray(): JSX.Element {
  const on = useXray();
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    if (!on) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPainted(true));
    });
    return () => {
      cancelAnimationFrame(frame);
      setPainted(false);
    };
  }, [on]);
  return <Inspector open={on && painted} onOpenChange={setXray} docsHref={docsHref} />;
}

/** X-ray on at load when the address asks for it (`?xray`), as the home page's "X-ray it" link does. */
function useXrayFromAddress(): void {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("xray")) setXray(true);
  }, []);
}

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
              <Suspense>
                <Repaint />
              </Suspense>
              <HomeReferenceIsland />
              <Popups />
            </main>
          )}
          <Suspense>
            <VoyageFooter />
          </Suspense>
        </div>
        <Xray />
        <Toaster />
      </PopupsProvider>
    </OuroProvider>
  );
}
