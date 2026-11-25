import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";
import { NumberField } from "@/registry/ouro/components/ouro/number-field/number-field";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { findDesignIssues } from "@/registry/ouro/check/design-check";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// text-box-trim clips the glyphs the browser draws inside an input or a textarea's value, since their value is UA
// replaced-element rendering, not a normal inline text run (#3529): capLabel's trim approach does not reach them. The
// browser's own line-box centring already holds the fields below even a tightened fieldSlackPx with no padding
// fix needed, at the root font size and at twice it (the fields' own font and padding are in rem, so this is the
// same page zoom a person's "larger text" setting drives); this guards that against a future regression. One line
// of words in a control spans several items, so no single item ships this file.

let host: HTMLDivElement;
let root: Root;

afterEach(() => {
  root?.unmount();
  host?.remove();
  document.documentElement.style.fontSize = "";
});

async function render(zoomed: boolean) {
  document.documentElement.style.fontSize = zoomed ? "200%" : "";
  host = document.createElement("div");
  host.style.padding = "24px";
  host.style.maxWidth = "420px";
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <>
        <TextField label="Search" placeholder="Search" hideLabel />
        <TextField label="Name" defaultValue="Rye loaf" hideLabel />
        <NumberField label="Count" defaultValue={42} hideLabel />
        <TextArea label="Note" rows={1} placeholder="Write" hideLabel />
        <Composer label="Message" placeholder="Write a message" onSend={() => {}} />
      </>,
    ),
  );
}

describe("cap height: TextField, NumberField, TextArea and Composer", () => {
  it.for([
    ["100%", false],
    ["200%", true],
  ] as const)("stay within the field cap-height tolerance at %s text", async ([, zoomed]) => {
    await render(zoomed);
    expect(findDesignIssues().filter((issue) => issue.rule === "off-centre-text")).toEqual([]);
  });
});
