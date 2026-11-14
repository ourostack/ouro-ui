import { describe, expect, it } from "vitest";
import { classChangeMatters, readInputClasses } from "./inputs.ts";

describe("corner input classes", () => {
  it("collects classes of rules that declare corner inputs, inside media rules too", () => {
    const style = document.createElement("style");
    style.textContent =
      ".a { border-radius: 4px } .b { cursor: pointer } @media (min-width: 1px) { .c { --x: 1 } }";
    document.head.append(style);
    const names = readInputClasses(document);
    style.remove();
    expect(names.has("a")).toBe(true);
    expect(names.has("c")).toBe(true);
    expect(names.has("b")).toBe(false);
  });

  it("treats every class as an input when a sheet cannot be read", () => {
    const fake = {
      styleSheets: [
        {
          get cssRules(): never {
            throw new Error("cross-origin");
          },
        },
      ],
    } as unknown as Document;
    const names = readInputClasses(fake);
    expect(classChangeMatters(names, "x", "y")).toBe(true);
  });

  it("matters when an added or a removed class is an input", () => {
    const names = new Set(["a"]);
    expect(classChangeMatters(names, "z", "z a")).toBe(true);
    expect(classChangeMatters(names, "a z", "z")).toBe(true);
    expect(classChangeMatters(names, null, "z")).toBe(false);
  });
});
