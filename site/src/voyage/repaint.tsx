import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Checklist } from "@/registry/ouro/components/ouro/checklist/checklist";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { toast } from "@/registry/ouro/lib/ouro/toast";
import type { PresetName } from "../themes/prepaint";
import { ByPreset, presetList, presetNamed, Swatch } from "./presets";
import { useSiteTheme } from "./theme-store";
import { Container } from "./layout";

/** The rows of the sample checklist, the same ones the copy-theme install proof renders. */
export const DIVE_CHECKS = [
  { id: "hatch", label: "Close the hatch" },
  { id: "tanks", label: "Fill the ballast tanks" },
  { id: "lights", label: "Test the lantern" },
  { id: "ned", label: "Find Ned Land" },
] as const;

/** Copies text, then says so in a toast; a refusal (no clipboard, no permission) says so too. */
async function copyText(text: string, done: string, how: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(done, { tone: "success", description: how });
  } catch {
    toast("Couldn't copy", { tone: "destructive", description: "Your browser kept the clipboard closed. Select the CSS on GitHub instead." });
  }
}

/** The sample the presets repaint: a checklist and a dialog, in a framed window. */
function DiveWindow(): JSX.Element {
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(["hatch"]));
  const [open, setOpen] = useState(false);
  return (
    <div className="site-window" data-site-sample="">
      <div className="site-window-bar">
        <span className="site-window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="site-mono truncate">before-we-dive.tsx</span>
        <span className="ms-auto inline-flex items-center gap-2">
          <ByPreset>
            {(item) => (
              <span className="inline-flex items-center gap-2">
                <Swatch preset={item.name} />
                {item.label}
              </span>
            )}
          </ByPreset>
        </span>
      </div>
      <div className="site-chart-grid grid gap-6 p-5 sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-(--shadow-sm) sm:p-5">
          <Checklist
            label="Before we dive"
            description="Tick them off. Conseil is watching."
            items={DIVE_CHECKS.map((item) => ({ ...item, checked: checked.has(item.id) }))}
            onCheckedChange={(id, isChecked) =>
              setChecked((previous) => {
                const next = new Set(previous);
                if (isChecked) next.add(id);
                else next.delete(id);
                return next;
              })
            }
            onClearChecked={() => setChecked(new Set())}
          />
        </div>
        <div className="grid content-between gap-6">
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Headings</dt>
            <dd className="m-0 truncate font-[family-name:var(--font-heading)] font-semibold">
              <ByPreset>{(item) => item.heading}</ByPreset>
            </dd>
            <dt className="text-muted-foreground">Corners</dt>
            <dd className="site-mono m-0">
              <ByPreset>{(item) => item.radius}</ByPreset>
            </dd>
            <dt className="text-muted-foreground">Colours</dt>
            <dd className="m-0 flex flex-wrap gap-1.5">
              <span className="sr-only">Background, primary, accent, highlight and border</span>
              {["bg-background", "bg-primary", "bg-accent", "bg-chart-3", "bg-border"].map((color) => (
                <span key={color} aria-hidden="true" className={`size-5 rounded-md ring-1 ring-foreground/15 ${color}`} />
              ))}
            </dd>
          </dl>
          <div className="grid gap-3">
            <p className="m-0 text-sm text-muted-foreground">
              {checked.size === DIVE_CHECKS.length ? "All set. Down we go." : `${DIVE_CHECKS.length - checked.size} left before we dive.`}
            </p>
            <Dialog
              title="Dive to 300 fathoms?"
              description="The lantern stays on. Ned Land would like it noted that he is against this."
              open={open}
              onOpenChange={setOpen}
              footer={
                <>
                  <Button variant="outline" tone="secondary" onClick={() => setOpen(false)}>
                    Not yet
                  </Button>
                  <Button
                    onClick={() => {
                      setOpen(false);
                      toast("Diving", { description: "Conseil: Classified. One very deep dive." });
                    }}
                  >
                    Dive
                  </Button>
                </>
              }
            >
              <p className="m-0 text-sm text-muted-foreground">
                At 300 fathoms the sea is dark and very quiet. Captain Nemo says the fish there glow.
              </p>
            </Dialog>
            <Button onClick={() => setOpen(true)} aria-haspopup="dialog" data-site-dive-trigger="">
              Ready to dive?
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A preset's specimen: a little card of its own UI, drawn in its own variables (the span carries
 * `data-theme`), so each shows its own page, ink, primary, highlight, corners and shadow.
 */
function Specimen({ preset }: { preset: PresetName }): JSX.Element {
  return (
    <span data-theme={preset} aria-hidden="true" className="site-specimen">
      <span className="site-specimen-ink" />
      <span className="site-specimen-ink site-specimen-ink-short" />
      <span className="site-specimen-row">
        <span className="site-specimen-pill" />
        <span className="site-specimen-switch" />
        <span className="site-specimen-dot" />
      </span>
    </span>
  );
}

/** "Repaint the Nautilus": the six presets, Copy theme and Copy tokens only, over a live sample. */
export function Repaint(): JSX.Element {
  const { preset, setPreset } = useSiteTheme();
  const current = presetNamed(preset);
  return (
    <section aria-labelledby="repaint-title" id="themes" className="pt-20 pb-12 lg:pt-32 lg:pb-16">
      <Container className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="site-eyebrow">Themes</p>
          <h2 id="repaint-title" className="site-h2 mt-4">
            Repaint the Nautilus
          </h2>
          <p className="site-lede mt-5 max-w-[34ch]">Same components. Plain shadcn tokens. Your theme works too.</p>
          <div role="group" aria-label="Presets" className="site-specimens mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*]:min-w-0">
            {presetList.map((item) => (
              <Button
                key={item.name}
                variant="plain"
                tone="secondary"
                aria-pressed={item.name === preset}
                // The pressed look is the site's, keyed on html[data-theme] (voyage.css), so it is right before hydration.
                data-site-preset={item.name}
                onClick={() => setPreset(item.name)}
                className="h-auto w-full p-1.5"
              >
                <span className="site-specimen-face">
                  <Specimen preset={item.name} />
                  <span className="site-specimen-name">{item.label}</span>
                </span>
              </Button>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => void copyText(current.css.theme, `Copied the ${current.label} theme`, "Paste it at the end of your global CSS. The fonts come with it.")}>
              Copy theme
            </Button>
            <Button
              variant="outline"
              tone="secondary"
              onClick={() => void copyText(current.css.tokens, `Copied the ${current.label} tokens`, "Paste it at the end of your global CSS. Just the variables, without the fonts.")}
            >
              Copy tokens only
            </Button>
          </div>
          <p className="mt-4 mb-0 max-w-[44ch] text-sm text-muted-foreground">
            <ByPreset>
              {(item) => (
                <>
                  {item.label}: {item.mood.toLowerCase()}. Copy theme brings :root, .dark and @theme inline, plus @font-face for {item.fonts.join(", ")}.
                </>
              )}
            </ByPreset>
          </p>
        </div>
        <div className="lg:col-span-7">
          <DiveWindow />
        </div>
      </Container>
    </section>
  );
}
