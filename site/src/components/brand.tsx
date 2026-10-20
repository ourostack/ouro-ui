import type { JSX } from "react";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { href } from "../paths";

const render = (file: string) => href(`/brand/${file}`);

/**
 * The approved Ouro HX logo (site/public/brand/, listed in provenance.json): the rich render, at
 * the size given, served from its 128px, 256px or 1024px export. Decorative, so it always sits
 * beside a visible "Ouro HX" label; never recoloured, redrawn or replaced with the silhouette.
 */
export function HxLogo({ size, className }: { size: number; className?: string }): JSX.Element {
  return (
    <img
      src={render("ouro-hx-render-128.webp")}
      srcSet={`${render("ouro-hx-render-128.webp")} 128w, ${render("ouro-hx-render-256.webp")} 256w, ${render("ouro-hx-render.webp")} 1024w`}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt=""
      decoding="async"
      className={cn("shrink-0 select-none", className)}
      draggable={false}
    />
  );
}
