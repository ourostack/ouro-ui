import { StrictMode, useEffect, useState, type JSX } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";
import { DESCRIPTIONS, pageAt } from "./ia";
import { MOCKUPS } from "./mockups";
import { SearchPalette, useSearch, usePath } from "./shared";
import "./lab.css";

const params = new URLSearchParams(location.search);
const LIVE = "https://ui.ouroboros.bot";

function setScheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}
const initialDark = params.get("theme") ? params.get("theme") === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
document.documentElement.setAttribute("data-theme", "pearl");
setScheme(initialDark);

/** Lab chrome, kept apart from the mockup: which mockup, and light or dark. */
function Dock({ current }: { current: string | null }): JSX.Element {
  const [dark, setDark] = useState(initialDark);
  const link = (id: string | null) => {
    const next = new URLSearchParams(location.search);
    if (id) next.set("m", id);
    else next.delete("m");
    return `?${next.toString()}${location.hash}`;
  };
  return (
    <div className="lab-dock pointer-events-none fixed inset-x-0 bottom-3 z-30 flex justify-center px-3 pb-[env(safe-area-inset-bottom)]">
      <nav aria-label="Mockups" className="pointer-events-auto flex items-center gap-0.5 rounded-ouro-2xl bg-foreground p-1 text-background shadow-(--shadow-lg)">
        <a href={link(null)} aria-current={current === null ? "page" : undefined} className={dockItem}>
          Lab
        </a>
        {MOCKUPS.map((m) => (
          <a key={m.id} href={link(m.id)} aria-current={current === m.id ? "page" : undefined} aria-label={`${m.id.toUpperCase()}: ${m.name}`} className={dockItem}>
            {m.id.toUpperCase()}
          </a>
        ))}
        <button
          type="button"
          aria-pressed={dark}
          aria-label="Dark"
          onClick={() => {
            setDark(!dark);
            setScheme(!dark);
          }}
          className={`${dockItem} cursor-pointer border-0 bg-transparent`}
        >
          {dark ? "☾" : "☀"}
        </button>
      </nav>
    </div>
  );
}

const dockItem =
  "inline-flex size-11 items-center justify-center rounded-ouro-xl text-sm font-semibold text-background no-underline outline-background touch-manipulation transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-4 pointer-fine:hover:bg-[color-mix(in_oklab,var(--background)_18%,transparent)] aria-[current=page]:bg-background aria-[current=page]:text-foreground aria-pressed:bg-[color-mix(in_oklab,var(--background)_18%,transparent)]";

/** The page you land on: its name, its line, and the real page one press away. */
function Stub({ here }: { here: string }): JSX.Element {
  const page = pageAt(here);
  const lede = DESCRIPTIONS[here.split("#")[0]!] ?? page.hint ?? "";
  return (
    <main id="main" className="min-w-0 flex-1 py-10 pb-32 sm:py-14">
      <p className="m-0 text-sm font-medium text-muted-foreground">You followed the menu to</p>
      <h1 className="mt-2 mb-0 font-[family-name:var(--font-heading,inherit)] text-4xl leading-tight font-semibold tracking-[-0.02em] text-foreground sm:text-5xl">{page.label}</h1>
      {lede && <p className="mt-4 mb-0 max-w-[42rem] text-lg leading-7 text-muted-foreground">{lede}</p>}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button href={`${LIVE}${here}`} variant="outline" tone="secondary">
          Open the real page ↗
        </Button>
      </div>
      <section aria-label="Try" className="mt-12 grid max-w-[42rem] gap-3 text-[0.9375rem] leading-6 text-foreground">
        <h2 className="m-0 font-[family-name:var(--font-heading,inherit)] text-xl font-semibold">Things to try</h2>
        <ul className="m-0 grid gap-1.5 ps-5 text-muted-foreground">
          <li>Find Ouro AX for Windows, then Get started on Android. Every platform should look the same.</li>
          <li>Rest the pointer on a menu for half a second, then slide across to another.</li>
          <li>Tab in, open a panel with Enter, press Escape. Focus goes back to its button.</li>
          <li>Press ⌘K, or the search button on a phone, and type "sheet".</li>
          <li>Scroll: the bar stays, the family strip goes.</li>
        </ul>
      </section>
      {Array.from({ length: 6 }, (_, index) => (
        <p key={index} className="mt-8 mb-0 max-w-[42rem] text-[0.9375rem] leading-7 text-muted-foreground">
          This page is a stand-in, so you can feel how the header marks where you are. The real page lives at the link above.
        </p>
      ))}
    </main>
  );
}

function LabIndex(): JSX.Element {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-12 pb-32 sm:px-6">
      <p className="m-0 text-sm font-medium text-muted-foreground">Ouro UI · nav lab</p>
      <h1 className="mt-2 mb-0 font-[family-name:var(--font-heading,inherit)] text-4xl leading-tight font-semibold tracking-[-0.02em] text-foreground">Five navs to play with</h1>
      <p className="mt-4 mb-0 text-lg leading-7 text-muted-foreground">Each one reaches every public page, shows Web, Apple, Windows and Android in the same shape, keeps search in view and puts the family in a quiet strip. Try each on a laptop and on your phone.</p>
      <ol className="mt-8 grid list-none gap-2 p-0">
        {MOCKUPS.map((m) => (
          <li key={m.id}>
            <a href={`?m=${m.id}#/`} className="grid min-h-11 gap-1 rounded-ouro-2xl px-4 py-3 no-underline outline-ring ring-1 ring-border transition-colors duration-(--ouro-duration-fast) ease-[ease] focus-visible:outline-2 focus-visible:outline-solid pointer-fine:hover:bg-accent active:bg-accent">
              <span className="font-[family-name:var(--font-heading,inherit)] text-xl font-semibold text-foreground">
                {m.id.toUpperCase()}. {m.name}
              </span>
              <span className="text-[0.9375rem] leading-6 text-muted-foreground">{m.idea}</span>
            </a>
          </li>
        ))}
      </ol>
    </main>
  );
}

function Lab(): JSX.Element {
  const here = usePath();
  const [searching, setSearching] = useSearch();
  const mockup = MOCKUPS.find((m) => m.id === params.get("m")) ?? null;
  useEffect(() => {
    if (!params.has("open")) return;
    // For screenshots and Ouro check: open the mockup's first menu once the page has settled.
    const timer = window.setTimeout(() => {
      const target = [...document.querySelectorAll<HTMLElement>("[data-lab-open]")].find((el) => el.checkVisibility());
      target?.click();
    }, 400);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = mockup ? `${pageAt(here).label} · ${mockup.name} · nav lab` : "Nav lab · Ouro UI";
  }, [here, mockup]);
  if (!mockup)
    return (
      <>
        <LabIndex />
        <Dock current={null} />
      </>
    );
  const props = { here, search: () => setSearching(true) };
  return (
    <>
      <mockup.Header {...props} />
      <div className="mx-auto flex max-w-7xl gap-8 px-4 sm:px-6 lg:px-8">
        {mockup.Aside && <mockup.Aside {...props} />}
        <Stub here={here} />
      </div>
      <SearchPalette open={searching} onOpenChange={setSearching} />
      <Dock current={mockup.id} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OuroProvider>
      <Lab />
    </OuroProvider>
  </StrictMode>,
);
