import { useEffect, useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Moment } from "@/registry/ouro/components/ouro/moment/moment";
import { TrayArt } from "../tray-art";

// The live demo at the top of docs/moment/: the component as an app would use it, with its props, nothing else.
// The art is made-up placeholder art: plain shapes in currentColor (set by the moment's kind) and the theme.

function TickArt(): JSX.Element {
  return (
    <svg viewBox="40 16 120 128" fill="none">
      <ellipse cx="100" cy="136" rx="62" ry="6" fill="currentColor" opacity="0.12" />
      <circle cx="100" cy="70" r="46" fill="currentColor" opacity="0.14" />
      <circle cx="100" cy="70" r="30" fill="currentColor" />
      <path d="m86 71 10 10 19-21" className="stroke-background" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const copy = {
  empty: ["No messages yet", "Messages you send show up here.", "Send a message"],
  loading: ["Sending", "This takes a moment.", "Sending"],
  success: ["Message sent", "Replies show up here.", "Start over"],
} as const;

export default function MomentDemo(): JSX.Element {
  const [step, setStep] = useState<keyof typeof copy>("empty");
  useEffect(() => {
    if (step !== "loading") return;
    const timer = setTimeout(() => setStep("success"), 1200);
    return () => clearTimeout(timer);
  }, [step]);
  const [title, description, label] = copy[step];
  return (
    <div className="w-full max-w-lg rounded-xl border border-border bg-card text-card-foreground">
      <Moment
        headingLevel={2}
        kind={step}
        art={step === "empty" ? <TrayArt /> : step === "success" ? <TickArt /> : undefined}
        title={title}
        description={description}
        announce={step === "success"}
        action={
          <Button loading={step === "loading"} variant={step === "success" ? "outline" : "solid"} onClick={() => setStep(step === "empty" ? "loading" : "empty")}>
            {label}
          </Button>
        }
      />
    </div>
  );
}
