import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { choiceList, Swatch } from "../voyage/presets";
import { rovingDots } from "./use-roving-dots";
import { originOf, useSiteTheme } from "../voyage/theme-store";

// The looks under a component page's live demo, loaded once the page answers (phone-demo.tsx): press one and the whole
// page repaints from that dot, the demo with it, so a reader sees the component in each look in a press.

/** A row of the site's looks, Live first, each a dot that repaints the page from where it was pressed. */
export default function DemoLooks(): JSX.Element {
  const { preset, setPreset } = useSiteTheme();
  const roving = rovingDots(choiceList.map((item) => item.name), preset);
  return (
    // The ring on the chosen dot's swatch, from the group, so each Button keeps only layout classes.
    <div
      role="group"
      aria-label="Try a look"
      className="flex items-center gap-0.5 [&_[aria-pressed=true]_[data-theme]]:outline-2 [&_[aria-pressed=true]_[data-theme]]:outline-offset-2 [&_[aria-pressed=true]_[data-theme]]:outline-primary [&_[aria-pressed=true]_[data-theme]]:outline-solid"
      data-site-demo-looks=""
      onKeyDown={roving.onKeyDown}
    >
      {choiceList.map((item) => (
        <Button
          key={item.name}
          variant="plain"
          tone="secondary"
          size="sm"
          aria-pressed={item.name === preset}
          aria-label={`${item.label} look`}
          tabIndex={roving.tabIndex(item.name)}
          onClick={(event) => setPreset(item.name, originOf(event))}
          className="h-auto p-1"
        >
          <Swatch preset={item.name} size="md" />
        </Button>
      ))}
    </div>
  );
}
