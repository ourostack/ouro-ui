import { expect } from "@playwright/test";
import { CHECKBOX, CHECKED, inOneSentence, UNCHECKED } from "./phrases";
import { heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

// Causal probes run after the unchanged release specs, preserving their original order.
test.use({ storyId: storyIds.checkbox });

for (const mode of ["ouro", "ouro-without-motion", "native"] as const) {
  for (let trial = 1; trial <= 3; trial++) {
    test(`diagnostic ${mode} ${trial}: speaks both checked and unchecked after Space`, async ({ page, sr }) => {
      if (mode === "ouro-without-motion") {
        await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });
      } else if (mode === "native") {
        await page.locator("#storybook-root").evaluate((root) => {
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "checkbox";
          label.append(input, document.createTextNode("Email me new recipes"));
          root.replaceChildren(label);
        });
      }
      await startReading(sr, page);
      const box = page.getByRole("checkbox", { name: "Email me new recipes" });
      await heard(sr, () => box.focus(), (phrase) => inOneSentence(phrase, /\bemail me new recipes\b/i, CHECKBOX, UNCHECKED), `${mode}: named checkbox, unchecked`);
      for (const checked of [true, false]) {
        const toggle = async () => {
          await page.keyboard.press("Space");
          await expect(box).toBeChecked({ checked });
        };
        await heard(sr, toggle, (phrase) => inOneSentence(phrase, checked ? CHECKED : UNCHECKED), `${mode}: ${checked ? "checked" : "unchecked"}, after Space`);
      }
    });
  }
}
