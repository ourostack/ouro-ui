import { lazy, Suspense, type JSX, type ReactNode } from "react";
import { Hero, type HeroPictures } from "@/registry/ouro/components/ouro/hero/hero";
import { href } from "../paths";
import { SCENES, STORYBOOK, sceneSources, type SceneName } from "../storybook";
import { Container, SiteFooter } from "./layout";
import { Popups, PopupsProvider } from "./popups";

/**
 * The docs sidebar as an island, the way the voyage loads Chapter I (site/src/voyage/chapters/island.tsx):
 * the server renders it whole, so its links work before any JavaScript, and its code (the Sidebar, its
 * filter and their Base UI parts) loads after the page's own closure, then hydrates that HTML.
 */
const DocsSidebar = lazy(() => import("./docs-sidebar"));

/**
 * The site's one header (voyage/header.tsx), an island in the same way: its links are in the server's
 * HTML, and its theme picker, X-ray and search load after the page's own closure, so the docs keep
 * their first-load budget (site/e2e/catalog.spec.ts).
 */
const DocsHeader = lazy(() => import("./docs-header"));

/** The sidebar's column and the page's: the title and its picture open the page's column, over the words they name. */
const COLUMNS = "sm:grid sm:grid-cols-[16rem_minmax(0,1fr)] sm:gap-8 lg:gap-12";

/**
 * The page's column, which the picture fills: the window less its gutters, and from 640px less the sidebar too, until the
 * container stops at 79rem. In rem, so a larger browser font never makes the browser pick too small a file. A sizes
 * length counts rem at the browser's default, not at the page's larger type from 150rem and 200rem (styles.css), so those
 * steps give the column's width there in px: 56rem at 112.5% and at 125%.
 */
const COLUMN_SIZES = "(min-width: 200rem) 1120px, (min-width: 150rem) 1008px, (min-width: 79rem) 56rem, (min-width: 64rem) calc(100vw - 23rem), (min-width: 40rem) calc(100vw - 22rem), calc(100vw - 2rem)";

/** A docs page's arrival: its eyebrow and title, over the storybook scene it opens on. */
export interface DocsOpener {
  scene: SceneName;
  eyebrow: ReactNode;
  title: ReactNode;
  /** The docs' front door and the platform pages show their whole scene; the rest a band of it, so their words come soon. */
  tall?: boolean;
}

/**
 * A scene by day and at night, for Hero: below 640px its phone crop, cut to hold the whole of the scene's friends, and above
 * that the wide scene, each in AVIF then WebP. Each source carries its own width and height, so the picture holds the shape
 * of the file it shows and nothing moves when it arrives. On wider screens a band of the wide scene, framed on the friends'
 * faces (storybook.ts, `band`), unless the page shows the whole scene. The scene is the page's setting, not its content,
 * so it is decorative: the title says what the page is.
 */
export function docsPictures(scene: SceneName, tall = false): HeroPictures {
  const at = (path: string) => href(`${STORYBOOK}${path}`);
  const { height, band, phoneHeight, night: nightScene } = SCENES[scene];
  const picture = (night: boolean) => {
    const { phone, wide, header } = sceneSources(scene, at, night);
    const phoneBox = { media: "(max-width: 640px)", sizes: "calc(100vw - 2rem)", width: 768, height: night ? nightScene.phoneHeight : phoneHeight };
    return {
      src: header,
      width: 1536,
      height,
      decorative: true,
      sources: [
        { type: "image/avif", srcSet: phone("avif"), ...phoneBox },
        { type: "image/webp", srcSet: phone("webp"), ...phoneBox },
        { type: "image/avif", srcSet: wide("avif"), sizes: COLUMN_SIZES },
        { type: "image/webp", srcSet: wide("webp"), sizes: COLUMN_SIZES },
      ],
      ...(tall ? {} : { crop: "4 / 1", focus: `50% ${band}%` }),
    };
  };
  return { light: { ...picture(false), priority: true }, dark: picture(true) };
}

/**
 * Docs pages open on the registry Hero, as the rest of the site does: the eyebrow and title, then the page's storybook
 * scene in a frame no wider than the page's column, on the page's own background, with the sidebar beside them from 640px
 * up; on smaller screens the header's menu holds its links. The page's header is a named region of its own beside <main>,
 * not inside it, so Hero's <header> is not a second banner.
 */
export function DocsShell({ current, opener, children }: { current: string; opener?: DocsOpener; children: ReactNode }): JSX.Element {
  return (
    <PopupsProvider>
      <Suspense>
        <DocsHeader current={current} />
      </Suspense>
      <Container className={COLUMNS}>
        {/* Below 640px the header's one menu lists the docs too (voyage/site-menu.tsx), so the sidebar steps aside. */}
        <aside className="max-sm:hidden">
          <Suspense>
            <DocsSidebar current={current} />
          </Suspense>
        </aside>
        <div className="min-w-0">
          {opener && (
            <section aria-labelledby="page-title" data-brand-scene={opener.scene}>
              <Hero
                layout="column"
                fullWidth
                motion="none"
                eyebrow={opener.eyebrow}
                /* A component's name is one long word, such as ColorSchemeProvider: on a phone it breaks rather than scroll sideways. */
                title={
                  <span id="page-title" className="[overflow-wrap:anywhere]">
                    {opener.title}
                  </span>
                }
                picture={docsPictures(opener.scene, opener.tall)}
              />
            </section>
          )}
          <main id="main" className="pt-8 lg:pt-10">
            {children}
            <Popups />
          </main>
        </div>
      </Container>
      <SiteFooter />
    </PopupsProvider>
  );
}
