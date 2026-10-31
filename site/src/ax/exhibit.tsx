import type { JSX } from "react";
import { Screen, Transcript } from "./parts";
import transcripts from "./transcripts.json";

/** The hero's exhibit: Sam's ask and the agent's answer, beside the command that did it and what the tool printed. */
export default function AxExhibit(): JSX.Element {
  return (
    <div id="ax-exhibit" className="grid items-start gap-4 sm:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:grid-cols-1 xl:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
      <Screen
        label="Sam sees"
        seen={[
          { kind: "sam", text: "Tell Design sync I'm running late." },
          { kind: "agent", text: "Done: posted in Design sync." },
        ]}
      />
      <Transcript label="The agent sees" steps={transcripts.late.slice(1)} />
    </div>
  );
}
