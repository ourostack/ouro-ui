import { afterEach, describe, expect, it } from "vitest";
import { applyStress } from "@/registry/ouro/check/stress";
import { findSizeIssues } from "@/registry/ouro/check/size-check";

let host: HTMLDivElement;

afterEach(() => {
  host?.remove();
  document.documentElement.removeAttribute("data-ouro-check-large-text");
  document.documentElement.style.removeProperty("font-size");
  document.body.style.removeProperty("font-size");
});

function render(html: string): HTMLDivElement {
  host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

describe("Ouro check stress inputs", () => {
  it("makes visible text longer without interpreting markup or changing hidden and executable text", () => {
    const root = render('<p id="label">Save &lt;draft&gt;</p><p hidden>Hidden</p><pre>const n = 1</pre><script type="application/json">{"name":"Save"}</script><input value="Untouched"><div data-ouro-check-stress-skip>Stable</div>');
    applyStress("long-text");
    expect(root.querySelector("#label")!.textContent).toBe("Save <draft> Save <draft> Save <draft>");
    expect(root.querySelector("#label")!.children).toHaveLength(0);
    expect(root.querySelector("[hidden]")!.textContent).toBe("Hidden");
    expect(root.querySelector("pre")!.textContent).toBe("const n = 1");
    expect(root.querySelector("script")!.textContent).toBe('{"name":"Save"}');
    expect(root.querySelector("input")!.value).toBe("Untouched");
    expect(root.querySelector("[data-ouro-check-stress-skip]")!.textContent).toBe("Stable");
  });

  it("substitutes whole numeric labels, not a number inside prose, a date or an editable value", () => {
    const root = render('<span> 12 </span><span>3+</span><span>12 unread</span><time>2026-11-10</time><div contenteditable>9</div><span hidden>8</span>');
    applyStress("counts");
    expect([...root.children].map((node) => node.textContent)).toEqual([" 999+ ", "999+", "12 unread", "2026-11-10", "9", "8"]);
  });

  it("feeds clipped text to the existing size rule, rather than inventing a stress rule", async () => {
    render('<p style="width:60px;white-space:nowrap;overflow:hidden;font:16px monospace">Save</p>');
    expect((await findSizeIssues()).filter((issue) => issue.rule === "clipped-text")).toHaveLength(0);
    applyStress("long-text");
    expect((await findSizeIssues()).filter((issue) => issue.rule === "clipped-text")).toHaveLength(1);
  });

  it("doubles root, fixed-pixel and inherited text sizes once without compounding inheritance", () => {
    document.documentElement.style.fontSize = "18px";
    const root = render('<p style="font-size:14px!important"><span>Inherited</span></p><p data-ouro-check-stress-skip style="font-size:12px">Stable</p>');
    applyStress("large-text");
    expect(getComputedStyle(document.documentElement).fontSize).toBe("36px");
    expect(getComputedStyle(root.querySelector("p")!).fontSize).toBe("28px");
    expect(getComputedStyle(root.querySelector("span")!).fontSize).toBe("28px");
    expect(getComputedStyle(root.querySelector("[data-ouro-check-stress-skip]")!).fontSize).toBe("12px");
    applyStress("large-text");
    expect(getComputedStyle(document.documentElement).fontSize).toBe("36px");
  });

  it("leaves content alone for context-level media and zoom inputs", () => {
    const root = render("<p>12</p>");
    for (const stress of ["zoom", "contrast", "forced-colors"] as const) applyStress(stress);
    expect(root.textContent).toBe("12");
    expect(document.querySelector("[data-ouro-check-large-text]")).toBeNull();
  });
});
