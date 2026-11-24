import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { capLabel, capLabelClass } from "@/registry/ouro/lib/ouro/cap-label";

describe("capLabel", () => {
  it("wraps text and numbers in a trimmed block and passes elements through", () => {
    const html = renderToStaticMarkup(<p>{capLabel(["Save", 3, <b key="b">icon</b>])}</p>);
    expect(html).toBe(
      `<p><span data-slot="cap-label-text" class="${capLabelClass}">Save</span><span data-slot="cap-label-text" class="${capLabelClass}">3</span><b>icon</b></p>`,
    );
  });
});
