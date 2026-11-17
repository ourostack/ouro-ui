import { useState } from "react";
import { expect, it } from "vitest";
import { page } from "vitest/browser";
import { Toolbar } from "@/registry/ouro/components/ouro/toolbar/toolbar";
import { scanStoryViolations } from "./story-axe";

// The story scan reaches what a person's pointer reaches. Runs in Chromium and WebKit.

const Mic = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2v12" />
  </svg>
);

it("opens a tooltip in a toolbar that auto-hid before the scan reached it (#1856)", async () => {
  await page.viewport(390, 844);
  // Already faded when the scan gets to it, as a slow runner leaves the story's 3 s bar; a pointer move over its area brings it back.
  const Faded = () => {
    const [hidden, setHidden] = useState(true);
    return (
      <div style={{ position: "relative", height: 240 }}>
        <Toolbar label="Call controls" floating autoHide={3000} hidden={hidden} onHiddenChange={setHidden} items={[{ type: "toggle", label: "Mute", icon: Mic, hideLabel: true }]} />
      </div>
    );
  };
  const { phases, text } = await scanStoryViolations("Toolbar/AutoHide", Faded);
  expect(phases).toContain('with the tooltip of "Mute" open');
  expect(text).toBe("");
});
