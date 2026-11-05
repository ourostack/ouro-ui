import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { tapsFor, vibrate } from "./haptics";
import kit from "./kit.json";

/*
 * The press's web twin: an Ouro HX web Button, which already dips to 0.97 for 0.16 seconds (ouro-base.css), doing
 * what the capture beside it does: Save turns into Saved, with the .checked moment's tap where a phone can vibrate.
 */

const CHECKED = kit.haptics.find((moment) => moment.name === "checked")!;

export function PressTwin(): JSX.Element {
  const [saved, setSaved] = useState(false);
  return (
    <div className="apple-press-twin" data-apple-twin="press">
      <p className="apple-twin-label">
        <span className="apple-twin-badge">Web twin</span> Press and hold to feel the dip; let go to save.
      </p>
      <div className="apple-press-stage">
        <p className="apple-press-title">Sunday lemon tart</p>
        <p className="apple-press-meta">Sharp, sunny, slightly showing off</p>
        <Button
          className="apple-press-button"
          tone={saved ? "success" : undefined}
          aria-pressed={saved}
          onClick={() => {
            setSaved((was) => !was);
            vibrate(tapsFor(CHECKED));
          }}
        >
          {saved ? "✓ Saved" : "Save"}
        </Button>
        <p className="apple-press-meta" aria-live="polite">
          {saved ? "In your cookbook." : "Not saved yet."}
        </p>
      </div>
    </div>
  );
}
