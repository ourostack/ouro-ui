import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { href } from "../paths";
import { AppleBand, AppleHero, AppleMenu, NextPage } from "./shell";

/*
 * /apple/components/: Ouro HX for Apple's first shared components. Prepared, not published: this page ships with
 * ouro-ui-apple v0.3.0, once that release passes its taste review. Before it does:
 *   - capture a loop per component from the package's gallery (clips.ts: apple-button, apple-empty-state,
 *     apple-banner, apple-sheet, apple-toast), light and dark, with stills;
 *   - check each sentence below against the released API and wrap its facts in claim() against the v0.3.0 commit;
 *   - add the page to APPLE_PAGES in shell.tsx and the overview's "Coming up" line.
 */

const COMPONENTS = [
  { name: "OuroButton", title: "A button with manners", body: "Presses with the shared spring and taps with a named haptic, in every tone and variant, glass included where the OS has it." },
  { name: "OuroEmptyState", title: "Nothing here, nicely", body: "What an empty screen says and offers, so a first visit feels like a welcome rather than a dead end." },
  { name: "OuroBanner", title: "News that stays put", body: "A message pinned to the page, with an urgency that sets its colour, its words to assistive tech and its haptic." },
  { name: "OuroSheet", title: "A sheet that knows its place", body: "Slides up on the sheet curve, and simply fades in when Reduce Motion is on." },
  { name: "OuroToast", title: "A word in passing", body: "A short note that queues politely behind the one before it, and stays until it has been read." },
] as const;

export default function AppleComponents(): JSX.Element {
  return (
    <div id="apple-components" className="apple">
      <AppleMenu current="/apple/" />
      <AppleHero
        id="apple-components-title"
        eyebrow="Ouro HX for Apple"
        title="Five components, already polite."
        actions={
          <Button href={href("/apple/start/")} variant="outline" tone="secondary">
            Add the package
          </Button>
        }
      >
        <p>The foundations, assembled: the spring, the press, the haptic moments and the themes, worn by the pieces every app needs first.</p>
      </AppleHero>
      {COMPONENTS.map((component) => (
        <AppleBand key={component.name} id={component.name} eyebrow={component.name} title={component.title} lede={<p>{component.body}</p>} />
      ))}
      <NextPage current="/apple/" />
    </div>
  );
}
