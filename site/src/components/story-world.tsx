import type { CSSProperties, JSX, ReactNode } from "react";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { href } from "../paths";
import { Container } from "../voyage/layout";
import { SCENES, STORYBOOK, sceneSources, type SceneName } from "../storybook";
import "./story-world.css";

const art = (path: string) => href(`${STORYBOOK}${path}`);

/**
 * One of the storybook scenes (storybook.ts), as the canonical files serve it: AVIF then WebP at 640,
 * 960 and 1536 pixels wide, and on a phone the crop around Ouro and the friends, in its own shape. Its width and
 * height are given for each crop, so nothing moves when it arrives.
 */
function ScenePicture({ scene, priority, sizes, decorative }: { scene: SceneName; priority: boolean; sizes: string; decorative: boolean }): JSX.Element {
  const { alt, height, phoneHeight } = SCENES[scene];
  const { phone, wide } = sceneSources(scene, art);
  return (
    <picture data-brand-scene={scene} className="story-world-picture">
      <source media="(max-width: 640px)" type="image/avif" srcSet={phone("avif")} sizes="100vw" width={768} height={phoneHeight} />
      <source media="(max-width: 640px)" type="image/webp" srcSet={phone("webp")} sizes="100vw" width={768} height={phoneHeight} />
      <source type="image/avif" srcSet={wide("avif")} sizes={sizes} width={1536} height={height} />
      <source type="image/webp" srcSet={wide("webp")} sizes={sizes} width={1536} height={height} />
      <img
        src={art(`headers/${scene}.webp`)}
        alt={decorative ? "" : alt}
        width={1536}
        height={height}
        className="story-world-img"
        draggable={false}
        // The canonical brand files, served byte for byte: the widest published is 1536px (768px for the phone crop),
        // so on a dense screen a painted scene is drawn up to twice its pixels, which its soft painted style carries.
        data-ouro-allow="blurry-image"
        data-ouro-allow-why="The storybook brand's canonical scene files, served unchanged: the widest published is 1536px, 768px for the phone crop."
        {...(priority ? { fetchPriority: "high" as const } : { loading: "lazy" as const, decoding: "async" as const })}
      />
    </picture>
  );
}

/**
 * A page's way into the storybook world: an open dawn sky that carries on from the top of the scene,
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
  decorative = false,
}: {
  scene: SceneName;
  variant?: "arrival" | "band";
  /** The words in the sky. */
  children?: ReactNode;
  className?: string | undefined;
  /** A picture that only sets the scene, as on every docs page: screen readers skip it rather than hear it each time. */
  decorative?: boolean;
}): JSX.Element {
  const { sky, sun, band, shortY } = SCENES[scene];
  const style = {
    ...Object.fromEntries(sky.map((colour, index) => [`--story-sky-${index + 1}`, colour])),
    "--story-sun-x": `${sun[0]}%`,
    "--story-sun-y": `${sun[1]}%`,
    "--story-band-y": `${band}%`,
    ...(shortY === undefined ? {} : { "--story-short-y": `${shortY}%` }),
  } as CSSProperties;
  return (
    <div className={cn("story-world", `story-world-${variant}`, className)} style={style}>
      {children ? <div className="story-world-sky">{children}</div> : null}
      <div className="story-world-view">
        <ScenePicture scene={scene} priority={variant !== "band"} sizes="100vw" decorative={decorative} />
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
