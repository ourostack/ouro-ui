import { afterEach, describe, expect, it } from "vitest";
import { audit, axeExclude, describeFindings, measureTextContrast } from "@/registry/ouro/lib/ouro/testing/axe";

// The gate fails closed: these pages are each wrong in a way axe alone reports at a low impact or
// cannot decide, and the gate must fail every one of them, and pass the same page done right.

afterEach(() => {
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
});

/** A page with a main landmark and a level-one heading, so only what a test adds can fail. */
function mountPage(content: string): HTMLElement {
  document.body.innerHTML = `<main><h1>Page</h1>${content}</main>`;
  return document.querySelector("main")!;
}

/** Where an element's text is on the screen: its first line. */
function textBox(element: Element): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getClientRects()[0]!;
}

const scanPage = () => audit({ include: [document.documentElement], exclude: axeExclude.map((selector) => [selector]) });
const rules = (findings: Awaited<ReturnType<typeof scanPage>>) => findings.map((finding) => `${finding.undecided ? "undecided " : ""}${finding.rule}`);

describe("audit", () => {
  it("passes a page that is right", async () => {
    mountPage('<p style="color:#111;background:#fff">Readable text</p>');
    expect(describeFindings(await scanPage())).toBe("");
  });

  it("fails a violation whatever its impact: content outside every landmark is only moderate", async () => {
    mountPage("<p>In the page</p>");
    document.body.insertAdjacentHTML("beforeend", "<div>Outside every landmark</div>");
    expect(rules(await scanPage())).toEqual(["region"]);
  });

  it("fails text a tag covers, which axe cannot judge", async () => {
    mountPage('<p style="margin:0;color:#111;background:#fff;font-size:16px;line-height:24px">Covered text here</p>');
    document.querySelector("main")!.insertAdjacentHTML("beforeend", '<a href="#docs" style="position:absolute;padding:0 4px;background:#3a3a3a;color:#fff;font-size:11px;line-height:16px">tag</a>');
    const box = textBox(document.querySelector("p")!);
    // Over the middle of the line, where axe looks for what lies over text.
    Object.assign(document.querySelector<HTMLElement>("a")!.style, { left: `${box.left + box.width / 2 - 10}px`, top: `${box.top + 4}px` });
    const findings = await scanPage();
    expect(findings.map((finding) => `${finding.undecided ? "undecided " : ""}${finding.rule} ${finding.target}`)).toEqual(["undecided color-contrast p"]);
    expect(findings[0]!.summary).toMatch(/^measured \d+\.\d\d:1 against the worst pixel behind its text, needs 4\.5:1$/);
  });

  it("measures a line drawn over text as what the text is seen against, though axe never sees it", async () => {
    mountPage('<p id="crossed" style="margin:0;color:#111;background:#fff;font-size:16px;line-height:24px">Crossed text</p>');
    document.body.insertAdjacentHTML("beforeend", '<div aria-hidden="true" style="position:fixed;inset:0;pointer-events:none"><div style="position:absolute;left:0;right:0;height:2px;background:#3a3a3a"></div></div>');
    const text = document.querySelector<HTMLElement>("#crossed")!;
    const box = text.getBoundingClientRect();
    document.querySelector<HTMLElement>('[aria-hidden="true"] > div')!.style.top = `${box.top + box.height / 2}px`;
    expect(await measureTextContrast(text, 4.5)).toEqual({ pass: false, reason: expect.stringMatching(/^measured \d+\.\d\d:1/) });
    document.querySelector('[aria-hidden="true"]')!.remove();
    expect(await measureTextContrast(text, 4.5)).toEqual({ pass: true });
  });

  it("passes text over a gradient when every pixel behind it meets 4.5:1, and fails faint text over the same gradient", async () => {
    mountPage(
      '<p id="dark" style="margin:0;padding:8px;color:#111;background:linear-gradient(90deg,#fff,#ddd)">Dark text on a gradient</p>' +
        '<p id="faint" style="margin:0;padding:8px;color:#999;background:linear-gradient(90deg,#fff,#ddd)">Faint text on a gradient</p>',
    );
    expect(await measureTextContrast(document.querySelector("#dark")!, 4.5)).toEqual({ pass: true });
    expect(await measureTextContrast(document.querySelector("#faint")!, 4.5)).toEqual({ pass: false, reason: expect.stringMatching(/^measured \d+\.\d\d:1/) });
    const findings = await scanPage();
    expect(findings.map((finding) => `${finding.undecided ? "undecided " : ""}${finding.rule} ${finding.target}`)).toEqual(["undecided color-contrast #faint"]);
  });

  it("fails a popup trigger whose expanded popup is missing, and passes it once the popup is there", async () => {
    mountPage('<button type="button" aria-haspopup="menu" aria-expanded="true" aria-controls="actions-menu">Actions</button>');
    expect(rules(await scanPage())).toEqual(["undecided aria-valid-attr-value"]);
    document.querySelector("main")!.insertAdjacentHTML("beforeend", '<div id="actions-menu" role="menu"><div role="menuitem" tabindex="-1">Print</div></div>');
    expect(describeFindings(await scanPage())).toBe("");
  });

  it("passes a collapsed popup trigger whose popup is not rendered yet", async () => {
    mountPage('<button type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="actions-menu">Actions</button>');
    expect(describeFindings(await scanPage())).toBe("");
  });

  it("fails a control hidden from assistive technology under a modal when Tab still reaches it, and passes it when the page is inert", async () => {
    document.body.innerHTML =
      '<main aria-hidden="true"><h1>Page</h1><a href="#page">Behind the dialog</a></main>' +
      '<div role="dialog" aria-modal="true" aria-label="Edit"><button type="button">Save</button></div>';
    document.querySelector<HTMLElement>('[role="dialog"] button')!.focus();
    const findings = await scanPage();
    expect(rules(findings)).toContain("undecided aria-hidden-focus");
    expect(findings.find((finding) => finding.rule === "aria-hidden-focus")!.summary).toMatch(/^Tab reaches <a> "Behind the dialog"/);
    document.querySelector("main")!.setAttribute("inert", "");
    expect(rules(await scanPage())).not.toContain("undecided aria-hidden-focus");
  });

  it("passes text an open popup covers once the popup shuts it off from assistive technology, and measures what still shows", async () => {
    mountPage('<p id="under" style="margin:0;color:#111;background:#fff;font-size:16px;line-height:24px">Under the list</p>');
    document.body.insertAdjacentHTML("beforeend", '<div role="listbox" aria-label="Herbs" style="position:fixed;background:#222;color:#111;padding:0 4px"><div role="option" aria-selected="false">Basil</div></div>');
    const text = document.querySelector<HTMLElement>("#under")!;
    const box = textBox(text);
    const list = document.querySelector<HTMLElement>('[role="listbox"]')!;
    Object.assign(list.style, { left: `${box.left - 4}px`, top: `${box.top - 4}px`, width: `${box.width + 8}px`, height: `${box.height + 8}px` });
    // Exposed to assistive technology, the covered text is still what is there to read, and it fails.
    expect(await measureTextContrast(text, 4.5)).toEqual({ pass: false, reason: expect.stringMatching(/^measured/) });
    document.querySelector("main")!.setAttribute("aria-hidden", "true");
    expect(await measureTextContrast(text, 4.5)).toEqual({ pass: true });
    // Half uncovered, the half that shows is measured against what is behind it.
    Object.assign(list.style, { width: `${box.width / 2}px` });
    text.style.color = "#ccc";
    expect(await measureTextContrast(text, 4.5)).toEqual({ pass: false, reason: expect.stringMatching(/^measured/) });
  });
});
