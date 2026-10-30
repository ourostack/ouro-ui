import type { JSX } from "react";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { NAUTILUS_PAGE } from "./copy";
import { Container } from "./layout";

/** The story's opening on /nautilus/: its title, the motto on the porthole ring, and its chapters, with the ones still being built marked so. */
export function StoryOpening(): JSX.Element {
  return (
    <section aria-labelledby="story-title" className="site-story pt-14 pb-6 lg:pt-24 lg:pb-10">
      <Container className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="site-eyebrow" data-site-motto="">
            <span lang="la">{NAUTILUS_PAGE.motto}</span>
          </p>
          <h1 id="story-title" className="site-h1 mt-4">
            {NAUTILUS_PAGE.title}
          </h1>
          <p className="site-lede mt-5 max-w-[40ch]">{NAUTILUS_PAGE.intro}</p>
        </div>
        <nav aria-label={NAUTILUS_PAGE.chaptersLabel} className="lg:col-span-5 lg:self-end">
          <ol aria-label={NAUTILUS_PAGE.chaptersLabel} className="m-0 grid list-none gap-2 p-0">
            {NAUTILUS_PAGE.chapters.map((chapter) => (
              <li
                key={chapter.number}
                className="site-story-chapter flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border/70 bg-card px-4 py-3"
                data-site-chapter-ready={chapter.ready ? "" : undefined}
              >
                <span className="site-mono shrink-0 text-xs text-muted-foreground sm:w-24">{chapter.number}</span>
                <span className={chapter.ready ? "font-medium text-foreground" : "text-muted-foreground"}>{chapter.title}</span>
                <span className="ms-auto shrink-0">
                  {chapter.ready ? (
                    <a href="#chapter-one" className="site-quiet-link font-medium">
                      {NAUTILUS_PAGE.open}
                    </a>
                  ) : (
                    <Badge tone="secondary" variant="soft">
                      {NAUTILUS_PAGE.building}
                    </Badge>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </nav>
      </Container>
    </section>
  );
}
