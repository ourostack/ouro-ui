import { Suspense, useEffect, useState, type JSX } from "react";
import { Inspector } from "@/registry/ouro/components/ouro/inspector/inspector";
import { Toaster } from "@/registry/ouro/components/ouro/toast/toaster";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";
import { href } from "../paths";
import { VoyageHeader } from "../voyage/header";
import { Hero } from "../voyage/hero";
import { VoyageFooter } from "../voyage/layout";
import { Repaint } from "../voyage/repaint";
import { openXray, setXray, useXray } from "../voyage/xray-store";
import "../themes/presets.generated.css";
import "../voyage/voyage.css";

const docsHref = (item: string) => href(`/docs/${item}/`);

/**
 * X-ray: HX Inspector over the page. It opens in the frame after the press has painted (two
 * animation frames), because it measures every HX component on the page, so the Switch or the
 * button answers first; it closes at once.
 */
function Xray(): JSX.Element {
  const on = useXray();
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    if (!on) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPainted(true));
    });
    return () => {
      cancelAnimationFrame(frame);
      setPainted(false);
    };
  }, [on]);
  return <Inspector open={on && painted} onOpenChange={setXray} docsHref={docsHref} />;
}

/**
 * "Mobilis in mobili": the new landing page, built in slices on the hidden /voyage/ route
 * (noindex, unlinked) until it replaces "/" (site-design.md). Its own chunk and stylesheet.
 */
export default function VoyagePage(): JSX.Element {
  // Leaving the page turns X-ray off, so the next page starts without it.
  useEffect(() => () => setXray(false), []);
  return (
    <OuroProvider>
      {/* Each boundary hydrates as its own task, so no single task blocks a tap for long. */}
      <div className="voyage min-h-dvh bg-background text-foreground">
        <Suspense>
          <VoyageHeader />
        </Suspense>
        <main>
          <Hero onXray={openXray} />
          <Suspense>
            <Repaint />
          </Suspense>
        </main>
        <Suspense>
          <VoyageFooter />
        </Suspense>
      </div>
      <Xray />
      <Toaster />
    </OuroProvider>
  );
}
