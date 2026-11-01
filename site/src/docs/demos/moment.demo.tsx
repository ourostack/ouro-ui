import { useEffect, useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Moment } from "@/registry/ouro/components/ouro/moment/moment";

// The live demo at the top of docs/moment/: the component as an app would use it, with its props, nothing else.
// The art is made-up placeholder art: plain shapes in currentColor (set by the moment's kind) and the theme.

function TrayArt(): JSX.Element {
  return (
    <svg viewBox="0 0 200 150" fill="none">
      <ellipse cx="100" cy="136" rx="62" ry="6" fill="currentColor" opacity="0.12" />
      <circle cx="100" cy="30" r="12" className="fill-primary">
        <animateTransform attributeName="transform" type="translate" values="0 0; 0 -4; 0 0" dur="4s" repeatCount="indefinite" />
      </circle>
      <circle cx="132" cy="20" r="3" className="fill-primary" opacity="0.45" />
      <circle cx="68" cy="42" r="2" fill="currentColor" opacity="0.4" />
      <path d="M46 78 100 58l54 20-54 20Z" fill="currentColor" opacity="0.1" />
      <path d="M46 78 100 98v32l-54-22Z" fill="currentColor" opacity="0.28" />
      <path d="M154 78 100 98v32l54-22Z" fill="currentColor" opacity="0.42" />
    </svg>
  );
}

function TickArt(): JSX.Element {
  return (
    <svg viewBox="0 0 200 150" fill="none">
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
