import { Component, lazy, Suspense, useCallback, useEffect, useRef, type ComponentType, type ErrorInfo, type JSX, type ReactNode } from "react";
import { Link } from "@/registry/ouro/components/ouro/link/link";
import { Container } from "../layout";
import { ISLAND_FALLBACK } from "../copy";

/**
 * Resolves once the element with this id comes within half a screen of the viewport, or at once
 * where there is no such element or no IntersectionObserver.
 */
export function nearScreen(id: string): Promise<void> {
  return new Promise((resolve) => {
    const element = document.getElementById(id);
    if (!element || typeof IntersectionObserver === "undefined") {
      resolve();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        resolve();
      },
      { rootMargin: "50% 0px" },
    );
    observer.observe(element);
  });
}

/** Calls `onHydrated` once the island's content has committed, which in the browser is once React has hydrated it. */
function Hydrated({ onHydrated }: { onHydrated: () => void }): null {
  useEffect(onHydrated, [onHydrated]);
  return null;
}

/**
 * What an island shows when its chunk won't load: a line saying so, with a way to reload (a reload
 * starts the page's module loading afresh), in a section with the island's own id, so links to it
 * still land.
 */
export function IslandFallback({ id }: { id: string }): JSX.Element {
  return (
    <section id={id} data-island-failed="">
      <Container className="py-10 text-muted-foreground">
        <p className="m-0">
          {ISLAND_FALLBACK.text} <Link href="">{ISLAND_FALLBACK.reload}</Link>
        </p>
      </Container>
    </section>
  );
}

/**
 * Keeps an island's failure to itself: the rest of the page stays hydrated and answers, and the page
 * still marks itself ready (app.tsx), while the island shows its fallback.
 */
export class IslandBoundary extends Component<{ id: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`[ouro-site] The ${this.props.id} island did not load.`, error, info.componentStack);
  }

  override render(): ReactNode {
    return this.state.failed ? <IslandFallback id={this.props.id} /> : this.props.children;
  }
}

/**
 * Each chapter as an island (site-design.md: each chapter "hydrated when it nears the viewport"). The
 * server renders it whole, so it reads before any JavaScript; in the browser its chunk loads only
 * as the chapter nears the screen, and React hydrates the server's HTML then. Until that moment the
 * page's own closure carries none of its code. A press that lands on the island before then is held
 * and made again once it has hydrated, so a button pressed as the section scrolls in still answers,
 * unless the reader has pressed or typed elsewhere since. A chunk that fails to load leaves the
 * island's fallback and the rest of the page working (IslandBoundary). It is not tried again in
 * place: the browser keeps a failed module fetch for the page's life, so only a reload loads it afresh.
 */
export function island(id: string, load: () => Promise<{ default: ComponentType }>): () => JSX.Element {
  const Chapter = lazy(() => (import.meta.env.SSR ? load() : nearScreen(id).then(load)));
  return function Island(): JSX.Element {
    const hydrated = useRef(false);
    const held = useRef<HTMLElement | null>(null);
    useEffect(() => {
      const element = document.getElementById(id);
      if (!element || hydrated.current) return;
      // On the window, ahead of React's own listener, which stops a press on HTML it has not hydrated.
      const hold = (event: MouseEvent) => {
        if (hydrated.current || !(event.target instanceof Element) || !element.contains(event.target)) return;
        const target = event.target.closest<HTMLElement>("*:not(svg *)");
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        held.current = target;
      };
      // A press or key anywhere else since then makes the held press stale: it is dropped, not made out of turn.
      const drop = (event: Event) => {
        if (held.current && !(event.target instanceof Node && held.current.contains(event.target))) held.current = null;
      };
      window.addEventListener("click", hold, true);
      window.addEventListener("pointerdown", drop, true);
      window.addEventListener("keydown", drop, true);
      return () => {
        window.removeEventListener("click", hold, true);
        window.removeEventListener("pointerdown", drop, true);
        window.removeEventListener("keydown", drop, true);
      };
    }, []);
    const onHydrated = useCallback(() => {
      hydrated.current = true;
      if (!held.current) return;
      // A task later, so the press meets state React brought up to date after hydrating, such as the
      // reader's stored theme. It stays held until then, so a press or key in between still drops it.
      setTimeout(() => {
        const target = held.current;
        held.current = null;
        if (target?.isConnected) target.click();
      });
    }, []);
    return (
      <IslandBoundary id={id}>
        <Suspense>
          <Chapter />
          <Hydrated onHydrated={onHydrated} />
        </Suspense>
      </IslandBoundary>
    );
  };
}

export const ChapterOneIsland = island("chapter-one", () => import("./chapter-one"));

/** Chapter II: its Chart, and Recharts with it, load only with this island, never with the page. */
export const ChapterTwoIsland = island("chapter-two", () => import("./chapter-two"));

export const ChapterThreeIsland = island("chapter-three", () => import("./chapter-three"));

/** The Ouro AX page's body (ax/ax-page.tsx): its script, with the kit's example tool, loads only on that page. */
export const AxIsland = island("ax", () => import("../../ax/ax-page"));

/** The Ouro AX hero's exhibit (ax/exhibit.tsx), an island in the same way, which shares the page's chunk for its parts. */
export const AxExhibitIsland = island("ax-exhibit", () => import("../../ax/exhibit"));

/** The home page's agents and install sections, as an island in the same way (home-reference.tsx). */
export const HomeReferenceIsland = island("reference", () => import("../home-reference"));

/** The home page's themes section, as an island in the same way (repaint.tsx): its Checklist and Dialog load as it nears the screen. */
export const RepaintIsland = island("themes", () => import("../repaint").then((module) => ({ default: module.Repaint })));
