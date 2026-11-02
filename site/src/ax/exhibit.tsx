import type { JSX } from "react";
import { Screen, Transcript } from "./parts";
import { LATE_SEEN, TRANSCRIPTS } from "./story";

/** The hero's exhibit: the person's ask and their agent's reply, beside the refusal that named its fix, the command that did it and what the tool printed. */
export default function AxExhibit(): JSX.Element {
  return (
    <div id="ax-exhibit" className="ax-exhibit grid items-start gap-4">
      <Screen label={"What you see"} seen={LATE_SEEN} />
      <Transcript label={"What your agent sees"} steps={TRANSCRIPTS.late} />
    </div>
  );
}
