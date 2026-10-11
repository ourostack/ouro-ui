import { useRef, useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import {
  SheetBackdrop,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHandle,
  SheetPopup,
  SheetPortal,
  SheetRoot,
  SheetTitle,
  SheetTrigger,
  SheetViewport,
} from "@/registry/ouro/components/ouro/sheet/sheet-parts";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { CheckIcon, PlusIcon } from "./icons";

const cookbooks = ["Weeknights", "Summer", "For guests"];

/**
 * The live Sheet, inside a phone-sized screen. It is built from the Sheet parts, the
 * escape hatch for what props can't say: here, portaling into the screen instead of
 * <body>. The screen contains layout and paint, so the sheet's fixed layers position
 * against it, not the page.
 */
export function PhoneDemo(): JSX.Element {
  const screen = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState<ReadonlySet<string>>(() => new Set(["Weeknights"]));
  const toggle = (name: string) =>
    setSaved((current) => {
      const next = new Set(current);
      if (!next.delete(name)) next.add(name);
      return next;
    });

  return (
    <figure className="m-0 flex flex-col items-center gap-5">
      <div className="w-[min(100%,20rem)] rounded-[3rem] bg-(--site-bezel) p-2.5 shadow-[0_1px_0_rgb(255_255_255/0.06)_inset,0_30px_60px_-20px_rgb(0_0_0/0.35),0_12px_24px_-12px_rgb(0_0_0/0.25)]">
        <div
          ref={screen}
          data-site-phone-screen=""
          className="relative isolate h-[36rem] overflow-hidden rounded-[2.4rem] bg-background [contain:layout_paint]"
        >
          <div aria-hidden="true" className="absolute top-2.5 left-1/2 z-10 h-6 w-22 -translate-x-1/2 rounded-full bg-(--site-bezel)" />
          <div className="flex h-full flex-col px-5 pt-14 pb-6">
            <Text size="sm" tone="muted">
              Dinner · 25 minutes
            </Text>
            <Heading level={3} size="xl" className="mt-1">
              Lemon ricotta pasta
            </Heading>
            <div
              aria-hidden="true"
              className="mt-5 aspect-[4/3] rounded-2xl bg-muted bg-[radial-gradient(circle_at_28%_32%,color-mix(in_oklab,var(--warning)_40%,transparent),transparent_55%),radial-gradient(circle_at_72%_68%,color-mix(in_oklab,var(--success)_30%,transparent),transparent_50%),radial-gradient(circle_at_60%_25%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_45%)]"
            />
            <Text size="sm" tone="muted" className="mt-4">
              Ricotta, lemon zest and black pepper, loosened with a splash of the pasta water.
            </Text>
            <SheetRoot>
              <div className="mt-auto">
                <SheetTrigger render={<Button fullWidth size="lg">Save to cookbook</Button>} />
              </div>
              <SheetPortal container={screen}>
                <SheetBackdrop />
                <SheetViewport>
                  <SheetPopup>
                    <SheetHandle />
                    <div className="grid shrink-0 gap-1 px-5 pt-3 pb-2">
                      <SheetTitle>Save to cookbook</SheetTitle>
                      <SheetDescription>Pick one or more.</SheetDescription>
                    </div>
                    <SheetContent>
                      <ul className="m-0 grid list-none gap-2 p-0">
                        {cookbooks.map((name) => {
                          const on = saved.has(name);
                          return (
                            <li key={name}>
                              <Button
                                fullWidth
                                variant={on ? "soft" : "outline"}
                                tone={on ? "primary" : "secondary"}
                                startIcon={on ? CheckIcon : PlusIcon}
                                aria-pressed={on}
                                onClick={() => toggle(name)}
                              >
                                {name}
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    </SheetContent>
                    <div className="shrink-0 px-5 pt-3 pb-5">
                      <SheetClose render={<Button fullWidth>Done</Button>} />
                    </div>
                  </SheetPopup>
                </SheetViewport>
              </SheetPortal>
            </SheetRoot>
          </div>
        </div>
      </div>
      <figcaption className="text-center text-sm text-muted-foreground">Drag it. Flick it. Pull it past the edge.</figcaption>
    </figure>
  );
}
