import type { JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { ByPreset, choiceList, Swatch } from "./presets";
import { originOf, useSiteTheme } from "./theme-store";
import { SKY_WORDS } from "./sky-words";

/**
 * The looks as a row of dots, Live first, with the chosen one's name and mood beside them. A press
 * repaints the whole page, spreading out from the dot. `data-site-preset` lets the head script
 * mark the stored one pressed before the page hydrates.
 */
export function ThemeDots({ label = "Theme", size = "lg", describe = true }: { label?: string; size?: "md" | "lg"; describe?: boolean }): JSX.Element {
  const { preset, sky, setPreset } = useSiteTheme();
  return (
    <div>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {choiceList.map((item) => (
          <Button
            key={item.name}
            variant="plain"
            tone="secondary"
            aria-pressed={item.name === preset}
            aria-label={item.label}
            data-site-preset={item.name}
            onClick={(event) => setPreset(item.name, originOf(event))}
            className="site-dot h-auto rounded-full p-1"
          >
            <Swatch preset={item.name} size={size} />
          </Button>
        ))}
      </div>
      {describe ? (
        <p className="mt-2.5 mb-0 text-sm text-muted-foreground [&_strong]:me-1 [&_strong]:font-semibold [&_strong]:text-foreground">
          <ByPreset>
            {(item) =>
              item.name === "live" ? (
                <>
                  <strong>Live</strong> {sky ? SKY_WORDS.now(sky.phase, sky.season) : item.mood}
                </>
              ) : (
                <>
                  <strong>{item.label}</strong> {item.mood}
                </>
              )
            }
          </ByPreset>
        </p>
      ) : null}
    </div>
  );
}
