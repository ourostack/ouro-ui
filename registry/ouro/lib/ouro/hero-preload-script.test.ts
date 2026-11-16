import { afterEach, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { colorSchemeScript } from "@/registry/ouro/lib/ouro/color-scheme-script";
import { heroPreloadScript, type HeroPreloadPictures } from "@/registry/ouro/lib/ouro/hero-preload-script";

const root = document.documentElement;
const run = (script: string) => new Function(script)() as void;
const preloads = () => [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="image"]')];

const pictures: HeroPreloadPictures = {
  light: { src: "/day.png", srcSet: "/day-640.png 640w, /day.png 1536w", sizes: "100vw" },
  dark: { src: "/night.png", srcSet: "/night-640.png 640w, /night.png 1536w", sizes: "50vw" },
};

afterEach(async () => {
  for (const link of preloads()) link.remove();
  root.classList.remove("dark");
  localStorage.removeItem("ouro-color-scheme");
  await commands.emulateMedia({ colorScheme: "light" });
});

describe("heroPreloadScript", () => {
  it("runs in the same script after colorSchemeScript, and preloads the twin the stored choice shows", () => {
    localStorage.setItem("ouro-color-scheme", "dark");
    run(colorSchemeScript() + heroPreloadScript(pictures));
    expect(preloads()).toHaveLength(1);
    expect(preloads()[0]!.getAttribute("href")).toBe("/night.png");
  });

  it("preloads the dark twin's srcSet and sizes with the dark class, and the light twin's without it", () => {
    root.classList.add("dark");
    run(heroPreloadScript(pictures));
    const [dark] = preloads();
    expect(preloads()).toHaveLength(1);
    expect(dark!.getAttribute("href")).toBe("/night.png");
    expect(dark!.getAttribute("imagesrcset")).toBe("/night-640.png 640w, /night.png 1536w");
    expect(dark!.getAttribute("imagesizes")).toBe("50vw");
    expect(dark!.getAttribute("fetchpriority")).toBe("high");
    root.classList.remove("dark");
    run(heroPreloadScript(pictures));
    const light = preloads().at(-1)!;
    expect(preloads()).toHaveLength(2);
    expect(light.getAttribute("href")).toBe("/day.png");
    expect(light.getAttribute("imagesrcset")).toBe("/day-640.png 640w, /day.png 1536w");
    expect(light.getAttribute("imagesizes")).toBe("100vw");
  });

  it("takes the first source whose media matches, with its type and sizes", async () => {
    await commands.emulateMedia({ colorScheme: "light" });
    const sourced: HeroPreloadPictures = {
      light: {
        src: "/day.jpg",
        srcSet: "/day.jpg 1536w",
        sources: [
          { srcSet: "/phone.avif 640w", sizes: "100vw", type: "image/avif", media: "(max-width: 1px)" },
          { srcSet: "/wide.webp 1536w", type: "image/webp", media: "(min-width: 1px)" },
        ],
      },
      dark: { src: "/night.jpg" },
    };
    run(heroPreloadScript(sourced));
    const [link] = preloads();
    expect(link!.getAttribute("imagesrcset")).toBe("/wide.webp 1536w");
    expect(link!.getAttribute("type")).toBe("image/webp");
    expect(link!.hasAttribute("imagesizes")).toBe(false);
  });

  it("takes the first source whose media matches when two match, as the browser does", () => {
    const twoMatch: HeroPreloadPictures = {
      light: {
        src: "/day.jpg",
        sources: [
          { srcSet: "/first.webp 1536w", type: "image/webp", media: "(min-width: 1px)" },
          { srcSet: "/second.webp 1536w", type: "image/webp", media: "(min-width: 1px)" },
        ],
      },
      dark: {},
    };
    run(heroPreloadScript(twoMatch));
    expect(preloads()[0]!.getAttribute("imagesrcset")).toBe("/first.webp 1536w");
  });

  it("preloads a twin with only src, with no srcset or type", () => {
    run(heroPreloadScript({ light: { src: "/only.png" }, dark: { src: "/only-night.png" } }));
    const [link] = preloads();
    expect(link!.getAttribute("href")).toBe("/only.png");
    expect(link!.hasAttribute("imagesrcset")).toBe(false);
    expect(link!.hasAttribute("type")).toBe(false);
  });

  it("preloads the first file of the srcSet when a twin has no src", () => {
    run(heroPreloadScript({ light: { srcSet: "/first.png 640w, /second.png 1536w" }, dark: {} }));
    expect(preloads()[0]!.getAttribute("href")).toBe("/first.png");
  });

  it("adds no link when a twin has no file to preload", () => {
    run(heroPreloadScript({ light: {}, dark: {} }));
    expect(preloads()).toHaveLength(0);
  });

  it("keeps a URL that contains </script> inside the script text", () => {
    const url = "/x.png?</script><img src=x>";
    const script = heroPreloadScript({ light: { src: url }, dark: { src: url } });
    expect(script).not.toContain("</script>");
    run(script);
    expect(preloads()[0]!.getAttribute("href")).toBe(url);
  });
});
