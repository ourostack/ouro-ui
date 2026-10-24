import { expect } from "@playwright/test";
import { CHECKBOX, CHECKED, inOneSentence, missedPhrase, UNCHECKED } from "./phrases";
import { describesFocus, heard, startReading, test } from "./screen-reader";
import { storyIds } from "./stories";

// Causal probes run after the unchanged release specs, preserving their original order.
test.use({ storyId: storyIds.checkbox });

for (let trial = 1; trial <= 6; trial++) {
  for (const mode of ["ouro", "native"] as const) {
    test(`diagnostic ${mode} ${trial}: compares browser and screen-reader activation`, async ({ page, sr }) => {
      if (mode === "native") {
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
      const transports = trial % 2 === 0 ? ["screen-reader", "browser"] : ["browser", "screen-reader"];
      for (const transport of transports) {
        for (const checked of [true, false]) {
          const state = checked ? CHECKED : UNCHECKED;
          const what = `${mode}/${transport}: ${checked ? "checked" : "unchecked"}`;
          const toggle = async () => {
            if (transport === "browser") await page.keyboard.press("Space");
            else await sr.act({ capture: false });
            await expect(box).toBeChecked({ checked });
          };
          try {
            await heard(sr, toggle, (phrase) => inOneSentence(phrase, state), what);
          } catch (error) {
            if (!(error instanceof Error) || !missedPhrase(error.message)) throw error;
            // Read the actual AT state for diagnosis, but never turn the missed event into a pass.
            await describesFocus(sr, (phrase) => inOneSentence(phrase, /\bemail me new recipes\b/i, CHECKBOX, state), `${what}, diagnostic description`).catch((descriptionError: unknown) => {
              console.log(`[sr] diagnostic description failed: ${String(descriptionError)}`);
            });
            throw error;
          }
        }
      }
    });
  }
}
