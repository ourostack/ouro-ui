import type { JSX } from "react";
import { Screen, Transcript } from "./parts";
import { cast } from "./cast";
import { TRANSCRIPTS } from "./story";

/** The hero's exhibit: the person's ask and the agent's answer, beside the command that did it and what the tool printed. */
export default function AxExhibit(): JSX.Element {
  return (
    <div id="ax-exhibit" className="ax-exhibit grid items-start gap-4">
      <Screen
        label={cast("{person} sees")}
        seen={[
          { kind: "person", text: "Tell Design sync I'm running late." },
          { kind: "agent", text: "Done: posted in Design sync." },
        ]}
      />
      <Transcript label={cast("{agent} sees")} steps={TRANSCRIPTS.late.slice(1)} />
    </div>
  );
}
