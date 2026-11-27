import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { RingCard } from "@/registry/ouro/components/ouro/ring-card/ring-card";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";

export default function RingCardDemo(): JSX.Element {
  const [state, setState] = useState("ringing");
  const [media, setMedia] = useState<"audio" | "video" | null>("audio");
  const [replying, setReplying] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const answer = (next: "audio" | "video" | null) => {
    setMedia(next);
    setState("pending");
  };
  return (
    <div className="grid w-full max-w-sm gap-6">
      <SegmentedControl label="Call state" hideLabel fullWidth value={state} onValueChange={(next) => {
        setState(next);
        setReplying(false);
        setReplySent(false);
      }} items={[
        { value: "ringing", label: "Ringing" },
        { value: "pending", label: "Connecting" },
        { value: "failed", label: "Failure" },
      ]} />
      <RingCard
        caller="Mara Vale" kind="video" note="Shall we take the scenic route?"
        announcement={state === "ringing" ? "Mara Vale is calling with video." : ""}
        onDecline={() => answer(null)} onAudio={() => answer("audio")} onVideo={() => answer("video")}
        pending={state === "pending" ? { label: replySent ? "Sending reply..." : media === "audio" ? "Connecting audio..." : media === "video" ? "Connecting video..." : "Declining...", media } : null}
        failure={state === "failed" ? {
          title: "Couldn't answer here",
          line: "Video isn't available. You can answer with audio.",
          action: <Tooltip content="Video couldn't start. Audio keeps your camera off."><Button fullWidth data-ax-action="answer" onClick={() => answer("audio")}>Answer with audio</Button></Tooltip>,
          announcement: "Couldn't answer here. Video isn't available. Answer with audio instead.",
        } : null}
        chips={<Button size="sm" tone="secondary" variant="soft" onClick={() => setReplying(true)}>Message instead</Button>}
      />
      {replying && state === "ringing" && <form className="grid gap-3" onSubmit={(event) => {
        event.preventDefault();
        setReplying(false);
        setReplySent(true);
        answer(null);
      }}>
        <TextField label="Reply to Mara" name="reply" required />
        <Button type="submit" tone="secondary">Send reply</Button>
      </form>}
    </div>
  );
}
