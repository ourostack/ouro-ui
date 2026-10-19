import { useState, type JSX } from "react";
import { Inspector } from "@/registry/ouro/components/ouro/inspector/inspector";
import { Toaster } from "@/registry/ouro/components/ouro/toast/toaster";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";
import { href } from "../paths";
import { VoyageHeader } from "../voyage/header";
import { Hero } from "../voyage/hero";
import { VoyageFooter } from "../voyage/layout";
import { Repaint } from "../voyage/repaint";
import "../themes/presets.generated.css";
import "../voyage/voyage.css";

/**
 * "Mobilis in mobili": the new landing page, built in slices on the hidden /voyage/ route
 * (noindex, unlinked) until it replaces "/" (site-design.md). Its own chunk and stylesheet.
 */
export default function VoyagePage(): JSX.Element {
  const [xray, setXray] = useState(false);
  return (
    <OuroProvider>
      <div className="voyage min-h-dvh bg-background text-foreground">
        <VoyageHeader xray={xray} onXrayChange={setXray} />
        <main>
          <Hero onXray={() => setXray(true)} />
          <Repaint />
        </main>
        <VoyageFooter />
      </div>
      <Inspector open={xray} onOpenChange={setXray} docsHref={(item) => href(`/docs/${item}/`)} />
      <Toaster />
    </OuroProvider>
  );
}
