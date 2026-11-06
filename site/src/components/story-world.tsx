import type { CSSProperties, JSX, ReactNode } from "react";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { href } from "../paths";
import { Container } from "../voyage/layout";
import { SCENES, STORYBOOK, type SceneName } from "../storybook";
import "./story-world.css";

const art = (path: string) => href(`${STORYBOOK}${path}`);

/**
 * One of the storybook scenes (storybook.ts), as the canonical files serve it: AVIF then WebP at 640,
 * 960 and 1536 pixels wide, and on a phone the 4:3 crop around Ouro and the product. Its width and
 * height are given for each crop, so nothing moves when it arrives.
 */
function ScenePicture({ scene, priority, sizes }: { scene: SceneName; priority: boolean; sizes: string }): JSX.Element {
  const { alt, height } = SCENES[scene];
  const phone = (type: "avif" | "webp") => `${art(`phone/${scene}-384.${type}`)} 384w, ${art(`phone/${scene}-768.${type}`)} 768w`;
  const wide = (type: "avif" | "webp") =>
    `${art(`scenes/${scene}-640.${type}`)} 640w, ${art(`scenes/${scene}-960.${type}`)} 960w, ${type === "avif" ? art(`scenes/${scene}-1536.avif`) : art(`headers/${scene}.webp`)} 1536w`;
  return (
    <picture data-brand-scene={scene} className="story-world-picture">
      <source media="(max-width: 640px)" type="image/avif" srcSet={phone("avif")} sizes="100vw" width={768} height={576} />
      <source media="(max-width: 640px)" type="image/webp" srcSet={phone("webp")} sizes="100vw" width={768} height={576} />
      <source type="image/avif" srcSet={wide("avif")} sizes={sizes} width={1536} height={height} />
      <source type="image/webp" srcSet={wide("webp")} sizes={sizes} width={1536} height={height} />
      <img
        src={art(`headers/${scene}.webp`)}
        alt={alt}
        width={1536}
        height={height}
        className="story-world-img"
        draggable={false}
        {...(priority ? { fetchPriority: "high" as const } : { loading: "lazy" as const, decoding: "async" as const })}
      />
    </picture>
  );
}

/**
 * A page's way into the storybook world: an open dawn sky that carries on from the top of the scene,
 * with the page's first words in it, then the scene, its edges melting into the page. No frame and no
 * card: the picture is the place, and the page continues below it.
 *
 * - `arrival`: the first thing on the page, full width, fetched first (the page's largest paint).
 * - `band`: further down a page, full width, fetched as it nears the screen.
 * - `inset`: inside a column (the docs), fetched first.
 */
export function StoryWorld({
  scene,
  variant = "arrival",
  children,
  className,
}: {
  scene: SceneName;
  variant?: "arrival" | "band" | "inset";
  /** The words in the sky. */
  children?: ReactNode;
  className?: string | undefined;
}): JSX.Element {
  const { sky, sun } = SCENES[scene];
  const style = {
    ...Object.fromEntries(sky.map((colour, index) => [`--story-sky-${index + 1}`, colour])),
    "--story-sun-x": `${sun[0]}%`,
    "--story-sun-y": `${sun[1]}%`,
  } as CSSProperties;
  return (
    <div className={cn("story-world", `story-world-${variant}`, className)} style={style}>
      {children ? <div className="story-world-sky">{children}</div> : null}
      <div className="story-world-view">
        <ScenePicture scene={scene} priority={variant !== "band"} sizes={variant === "inset" ? "(min-width: 64rem) 52rem, 100vw" : "100vw"} />
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
