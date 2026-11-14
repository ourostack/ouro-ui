import type { CSSProperties, JSX, ReactNode } from "react";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { href } from "../paths";
import { Container } from "../voyage/layout";
import { SCENES, STORYBOOK, sceneSources, type SceneName } from "../storybook";
import "./story-world.css";

const art = (path: string) => href(`${STORYBOOK}${path}`);

/** Full width until the world stops growing at max(1536px, 79rem) on a wide screen, with 79rem scaled by the root type there (112.5%, then 125%). In rem, so a larger browser font never makes it guess too small. */
const FULL_WORLD_SIZES = "(min-width: 200rem) max(1536px, 98.75rem), (min-width: 150rem) max(1536px, 88.875rem), (min-width: 100rem) max(1536px, 79rem), 100vw";

/**
 * One of the storybook scenes (storybook.ts), as the canonical files serve it: AVIF then WebP at 640,
 * 960, 1536 and 3072 pixels wide, and on a phone the crop around Ouro and the friends, in its own shape. Its width and
 * height are given for each crop, so nothing moves when it arrives. With `night`, the same scene at night, which the
 * stylesheet shows only in dark mode: it always waits to load until it's shown, so a light page never fetches it, and
 * the hidden one of the two is out of the accessibility tree, so a screen reader hears the scene once.
 */
function ScenePicture({ scene, priority, sizes, decorative, night = false }: { scene: SceneName; priority: boolean; sizes: string; decorative: boolean; night?: boolean }): JSX.Element {
  const { height } = SCENES[scene];
  const alt = night ? (SCENES[scene].night.alt ?? SCENES[scene].alt) : SCENES[scene].alt;
  const phoneHeight = night ? SCENES[scene].night.phoneHeight : SCENES[scene].phoneHeight;
  const { phone, wide, header } = sceneSources(scene, art, night);
  return (
    <picture data-brand-scene={night ? `${scene}-dark` : scene} className={night ? "story-world-picture story-world-night" : "story-world-picture story-world-day"}>
      <source media="(max-width: 640px)" type="image/avif" srcSet={phone("avif")} sizes="100vw" width={768} height={phoneHeight} />
      <source media="(max-width: 640px)" type="image/webp" srcSet={phone("webp")} sizes="100vw" width={768} height={phoneHeight} />
      <source type="image/avif" srcSet={wide("avif")} sizes={sizes} width={1536} height={height} />
      <source type="image/webp" srcSet={wide("webp")} sizes={sizes} width={1536} height={height} />
      <img
        src={header}
        alt={decorative ? "" : alt}
        width={1536}
        height={height}
        className="story-world-img"
        draggable={false}
        {...(priority && !night ? { fetchPriority: "high" as const } : { loading: "lazy" as const, decoding: "async" as const })}
      />
    </picture>
  );
}

/**
 * A page's way into the storybook world: an open dawn sky (a night sky in dark mode) that carries on from the top of the scene,
 * with the page's first words in it, then the scene, full width, ending on its own hard edges. No frame
 * and no card: the picture is the place, and the page continues below it.
 *
 * - `arrival`: the first thing on the page, full width, fetched first (the page's largest paint).
 * - `band`: further down a page, full width, fetched as it nears the screen.
 */
export function StoryWorld({
  scene,
  variant = "arrival",
  children,
  className,
  sizes = FULL_WORLD_SIZES,
  decorative = false,
}: {
  scene: SceneName;
  variant?: "arrival" | "band";
  /** The words in the sky. */
  children?: ReactNode;
  className?: string | undefined;
  /** How wide the scene draws, for the browser's file choice; defaults to the full-width world's width. */
  sizes?: string;
  /** A picture that only sets the scene, as on every docs page: screen readers skip it rather than hear it each time. */
  decorative?: boolean;
}): JSX.Element {
  const { sky, sun, band, shortY, night } = SCENES[scene];
  const style = {
    ...Object.fromEntries(sky.map((colour, index) => [`--story-sky-${index + 1}`, colour])),
    ...Object.fromEntries(night.sky.map((colour, index) => [`--story-night-${index + 1}`, colour])),
    "--story-sun-x": `${sun[0]}%`,
    "--story-sun-y": `${sun[1]}%`,
    "--story-band-y": `${band}%`,
    ...(shortY === undefined ? {} : { "--story-short-y": `${shortY}%` }),
  } as CSSProperties;
  return (
    <div className={cn("story-world", `story-world-${variant}`, className)} style={style}>
      {children ? <div className="story-world-sky">{children}</div> : null}
      <div className="story-world-view">
        <ScenePicture scene={scene} priority={variant !== "band"} sizes={sizes} decorative={decorative} />
        <ScenePicture scene={scene} priority={false} sizes={sizes} decorative={decorative} night />
        <span aria-hidden="true" className="story-world-sun" />
      </div>
    </div>
  );
}

/** A page's opening scene with one line in its sky, told as a story, for a page whose own hero follows. */
export function StoryOpener({ scene, line, short = true }: { scene: SceneName; line: string; short?: boolean }): JSX.Element {
  return (
    <StoryWorld scene={scene} className={short ? "story-world-short" : undefined}>
      <Container>
        <p className="story-world-line" data-story-line="">
          {line}
        </p>
      </Container>
    </StoryWorld>
  );
}
