import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Hero, type HeroPicture } from "@/registry/ouro/components/ouro/hero/hero";

// Loaded by hero-preload.spec.ts through Vite's SSR loader: Playwright compiles the JSX of any module its own
// worker imports with its own runtime, which would not render Hero.

/** Hero's server HTML for a pair of twins, as an app renders it. */
export function renderHero(light: HeroPicture, dark: HeroPicture): string {
  return renderToString(createElement(Hero, { title: "Spec", picture: { light, dark } }));
}
