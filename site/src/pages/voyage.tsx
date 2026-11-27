// First, so the page's own rules below come after Tailwind's and win.
import "../voyage/voyage-tailwind.css";
import { lazy, Suspense, useEffect, useState, type JSX } from "react";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";
import { AxHero } from "../ax/hero";
import { Popups, PopupsProvider } from "../components/popups";
import { HydrateInTurn } from "../hydrate";
import { APPLE_PATHS, href, normalizePath, PART_PATHS, PLATFORM_PATHS, type PlatformPath } from "../paths";
import { ActionsIsland, AdoptionIsland, AndroidAxIsland, AndroidHomeIsland, AndroidHxIsland, AndroidStartIsland, AppleAxIsland, AppleFeelIsland, AppleHomeIsland, AppleHxIsland, AppleReinsIsland, AppleStartIsland, AxExhibitIsland, AxIsland, ChapterOneIsland, ChapterThreeIsland, ChapterTwoIsland, ComposedUiIsland, CurrentIsland, HackamoreIsland, HomeReferenceIsland, HxIsland, ProofIsland, RepaintIsland, StoryIsland, WindowsAxIsland, WindowsHomeIsland, WindowsHxIsland, WindowsStartIsland, XrayIsland } from "../voyage/chapters/island";
import { useEggs } from "../voyage/eggs/listen";
import { VoyageHeader } from "../voyage/header";
import { TwoShips } from "../voyage/home";
import { VoyageHero } from "../voyage/hero";
import { VoyageFooter } from "../voyage/layout";
import { StoryOpening } from "../voyage/nautilus";
import { openXray, setXray, useSpotlight, useXray, useXrayFromAddress } from "../voyage/xray-store";
import "../themes/presets.generated.css";
import "../themes/by-preset.css";
import "../voyage/voyage.css";
import "../voyage/chapters/chapters.css";

const docsHref = (item: string) => href(`/docs/${item}/`);

/** Each Ouro UI for Apple page's body, an island of its own (apple/). */
const APPLE_ISLANDS: Record<(typeof APPLE_PATHS)[number], () => JSX.Element> = {
  "/apple/": AppleHomeIsland,
  "/apple/hx/": AppleHxIsland,
  "/apple/feel/": AppleFeelIsland,
  "/apple/ax/": AppleAxIsland,
  "/apple/reins/": AppleReinsIsland,
  "/apple/start/": AppleStartIsland,
};
const isApple = (page: string): page is (typeof APPLE_PATHS)[number] => page in APPLE_ISLANDS;

/** The platform pages' bodies (hx/ and platforms/), each an island of its own. */
const PLATFORM_ISLANDS: Record<PlatformPath, () => JSX.Element> = {
  "/hx/": HxIsland,
  "/windows/": WindowsHomeIsland,
  "/windows/hx/": WindowsHxIsland,
  "/windows/ax/": WindowsAxIsland,
  "/windows/start/": WindowsStartIsland,
  "/android/": AndroidHomeIsland,
  "/android/hx/": AndroidHxIsland,
  "/android/ax/": AndroidAxIsland,
  "/android/start/": AndroidStartIsland,
};
const isPlatform = (page: string): page is PlatformPath => (PLATFORM_PATHS as readonly string[]).includes(page);
/**
 * The header's section for a page, by part (site-menu.tsx): Ouro HX for every platform's pages, X-ray for Hackamore, and
 * Proof for the adoption board and Ouro Current. A page under its section, not the section's own, marks it as the section
 * you are in (`pageNav`).
 */
const SECTION_OF: Record<string, string> = { "/hackamore/": "/xray/", "/adoption/": "/proof/", "/current/": "/proof/" };
const headerSection = (page: string): string =>
  isApple(page) || isPlatform(page) ? "/hx/" : (SECTION_OF[page] ?? (["/nautilus/", "/ax/", "/proof/"].includes(page) || isPart(page) ? page : "/"));

/** Each part page's body, an island of its own (parts/). */
const PART_ISLANDS: Record<(typeof PART_PATHS)[number], () => JSX.Element> = {
  "/actions/": ActionsIsland,
  "/composed-ui/": ComposedUiIsland,
  "/xray/": XrayIsland,
  "/hackamore/": HackamoreIsland,
};
const isPart = (page: string): page is (typeof PART_PATHS)[number] => page in PART_ISLANDS;

/**
 * The page's two overlays load after the first paint, in one chunk (site/src/voyage/overlays.ts), so its first JavaScript
 * carries neither. HX Inspector renders only once someone turns X-ray on. The Toaster mounts on the reader's first press,
 * key or focus: every toast here answers one (Copy, the Dive, typing "nemo"), and one raised before the chunk arrives
 * waits in toast()'s queue until the Toaster connects.
 */
const Inspector = lazy(() => import("../voyage/overlays").then((module) => ({ default: module.Inspector })));
const Toaster = lazy(() => import("../voyage/overlays").then((module) => ({ default: module.Toaster })));
const WAKES = ["pointerdown", "keydown", "focusin", "click"] as const;

function LazyToaster(): JSX.Element | null {
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    if (wanted) return;
    const want = () => setWanted(true);
    for (const type of WAKES) addEventListener(type, want, { capture: true, passive: true });
    return () => {
      for (const type of WAKES) removeEventListener(type, want, { capture: true });
    };
  }, [wanted]);
  return wanted ? (
    <Suspense>
      <Toaster />
    </Suspense>
  ) : null;
}

/**
 * X-ray: HX Inspector over the page. It opens in the frame after the press has painted (two
 * animation frames), because it measures every HX component on the page, so the Switch or the
 * button answers first; it closes at once.
 */
function Xray(): JSX.Element | null {
  const on = useXray();
  const [wanted, setWanted] = useState(false);
  if (on && !wanted) setWanted(true);
  const spotlight = useSpotlight();
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    if (!on) return;
    const fallback = setTimeout(() => setPainted(true), 500);
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPainted(true));
    });
    return () => {
      clearTimeout(fallback);
      cancelAnimationFrame(frame);
      setPainted(false);
    };
  }, [on]);
  return wanted ? (
    <Suspense>
      <Inspector open={on && painted} onOpenChange={setXray} docsHref={docsHref} spotlight={spotlight} />
    </Suspense>
  ) : null;
}

/**
 * The voyage pages ("Mobilis in mobili", site-design.md), one chunk and stylesheet: the home page
 * (the porthole stage, the two ships, the themes, agents and install), the Nautilus's own page
 * (the story's opening, its chapters, then Chapter I) and Ouro AX's (a morning with an agent, an island).
 */
function ApplePage({ page }: { page: (typeof APPLE_PATHS)[number] }): JSX.Element {
  const Island = APPLE_ISLANDS[page];
  return <Island />;
}

function PlatformPage({ page }: { page: PlatformPath }): JSX.Element {
  const Island = PLATFORM_ISLANDS[page];
  return <Island />;
}

function PartPage({ page }: { page: (typeof PART_PATHS)[number] }): JSX.Element {
  const Island = PART_ISLANDS[page];
  return <Island />;
}

export default function VoyagePage({ path }: { path: string }): JSX.Element {
  const page = normalizePath(path);
  const nautilus = page === "/nautilus/";
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
            <VoyageHeader
              path={headerSection(page)}
              page={page}
              pageNav={headerSection(page) !== page && headerSection(page) !== "/"}
            />
          </Suspense>
          {isApple(page) ? (
            <main id="main">
              <ApplePage page={page} />
              <Popups />
            </main>
          ) : isPlatform(page) ? (
            <main id="main">
              <PlatformPage page={page} />
              <Popups />
            </main>
          ) : isPart(page) ? (
            <main id="main">
              <PartPage page={page} />
              <Popups />
            </main>
          ) : page === "/adoption/" ? (
            <main id="main">
              <AdoptionIsland />
              <Popups />
            </main>
          ) : page === "/current/" ? (
            <main id="main">
              <CurrentIsland />
              <Popups />
            </main>
          ) : page === "/proof/" ? (
            <main id="main">
              <ProofIsland />
              <Popups />
            </main>
          ) : page === "/ax/" ? (
            <main id="main">
              <AxHero exhibit={<AxExhibitIsland />} />
              <AxIsland />
              <Popups />
            </main>
          ) : nautilus ? (
            <main id="main">
              <StoryOpening />
              <ChapterOneIsland />
              <ChapterTwoIsland />
              <ChapterThreeIsland />
              <Popups />
            </main>
          ) : (
            <main id="main">
              <VoyageHero onXray={openXray} />
              <StoryIsland />
              <TwoShips />
              <RepaintIsland />
              <HomeReferenceIsland />
              <Popups />
            </main>
          )}
          <HydrateInTurn name="footer">
            <VoyageFooter />
          </HydrateInTurn>
        </div>
        <Xray />
        <LazyToaster />
      </PopupsProvider>
    </OuroProvider>
  );
}
