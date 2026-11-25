import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Toggle } from "@/registry/ouro/components/ouro/toggle/toggle";
import { capLabel, capLabelClass } from "@/registry/ouro/lib/ouro/cap-label";

describe("capLabel", () => {
  it("wraps text and numbers in a trimmed block and passes elements through", () => {
    const html = renderToStaticMarkup(<p>{capLabel(["Save", 3, <b key="b">icon</b>])}</p>);
    expect(html).toBe(
      `<p><span data-slot="cap-label-text" class="${capLabelClass}">Save</span><span data-slot="cap-label-text" class="${capLabelClass}">3</span><b>icon</b></p>`,
    );
  });

  it("trims a Button's label but leaves an inline Button's text as it is", () => {
    expect(renderToStaticMarkup(<Button>Save</Button>)).toContain(capLabelClass);
    expect(renderToStaticMarkup(<Button size="inline">Save</Button>)).not.toContain(capLabelClass);
  });

  it("trims a Toggle's visible label but not its screen-reader-only one", () => {
    expect(renderToStaticMarkup(<Toggle label="Bold" />)).toContain(capLabelClass);
    expect(renderToStaticMarkup(<Toggle label="Bold" hideLabel />)).not.toContain(capLabelClass);
  });

  it("unwraps a single child instead of returning a one-element array, which a render-weight budget would count as an extra component", () => {
    expect(Array.isArray(capLabel("Save"))).toBe(false);
    expect(Array.isArray(capLabel(["Save", "Cancel"]))).toBe(true);
  });
});
