import distCss from "../../dist/styles.css?raw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// These tests read the built dist/styles.css, so run `pnpm build` first.

let sheets: HTMLStyleElement[] = [];
function addStyle(css: string) {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  sheets.push(style);
  return style;
}
function addElement(html: string) {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  sheets.push(host as unknown as HTMLStyleElement);
  return host;
}

beforeEach(() => {
  addStyle(distCss);
});
afterEach(() => {
  for (const node of sheets) node.remove();
  sheets = [];
});

describe("layer order", () => {
  it("lets an unlayered app class win over a library utility", () => {
    addStyle(".app-mt { margin-top: 13px; }");
    const host = addElement('<div class="ou:mt-1 app-mt" id="both"></div><div class="ou:mt-1" id="lib"></div>');
    expect(getComputedStyle(host.querySelector("#lib")!).marginTop).toBe("4px");
    expect(getComputedStyle(host.querySelector("#both")!).marginTop).toBe("13px");
  });
});

describe("token shipping", () => {
  function layerBlocks(rules: CSSRuleList, name: string): CSSLayerBlockRule[] {
    return [...rules].filter((rule): rule is CSSLayerBlockRule => rule instanceof CSSLayerBlockRule && rule.name === name);
  }

  it("declares --ouro-color-accent inside @layer base in dist/styles.css", () => {
    const sheet = sheets[0]!.sheet!;
    const declared = layerBlocks(sheet.cssRules, "base").some((layer) =>
      [...layer.cssRules].some(
        (rule) => rule instanceof CSSStyleRule && rule.style.getPropertyValue("--ouro-color-accent") !== "",
      ),
    );
    expect(declared).toBe(true);
  });

  it("resolves the accent from the root", () => {
    expect(getComputedStyle(document.documentElement).getPropertyValue("--ouro-color-accent")).toMatch(
      /^light-dark\(#2563eb, #60a5fa\)$/,
    );
  });
});

describe("scoped overrides", () => {
  it("changes the solid and the soft accent utilities when only --ouro-color-accent is overridden", () => {
    const host = addElement(
      '<div id="plain"><i class="ou:bg-accent"></i><b class="ou:bg-soft-accent"></b></div>' +
        '<div id="scoped" style="--ouro-color-accent: rgb(255, 0, 0)"><i class="ou:bg-accent"></i><b class="ou:bg-soft-accent"></b></div>',
    );
    const bg = (selector: string) => getComputedStyle(host.querySelector(selector)!).backgroundColor;
    const solidBefore = bg("#plain i");
    const softBefore = bg("#plain b");
    expect(bg("#scoped i")).toBe("rgb(255, 0, 0)");
    expect(bg("#scoped i")).not.toBe(solidBefore);
    expect(bg("#scoped b")).not.toBe(softBefore);
    expect(bg("#scoped b")).toMatch(/^(color\(srgb 1 0 0 \/ 0\.14\)|rgba\(255, 0, 0, 0\.14\)|oklab\(.*\/ 0\.14\))/);
  });
});
