import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { RingCard } from "@/registry/ouro/components/ouro/ring-card/ring-card";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";

export default function RingCardDemo(): JSX.Element {
  const [state, setState] = useState("ringing");
  const [media, setMedia] = useState<"audio" | "video" | null>("video");
  const answer = (next: "audio" | "video" | null) => {
    setMedia(next);
    setState("pending");
  };
  return (
    <div className="grid w-full max-w-sm gap-6">
      <SegmentedControl label="Call state" hideLabel fullWidth value={state} onValueChange={setState} items={[
        { value: "ringing", label: "Ringing" },
        { value: "pending", label: "Connecting" },
        { value: "failed", label: "Failure" },
      ]} />
      <RingCard
        caller="Mara Vale" kind="video" note="Shall we take the scenic route?"
        announcement={state === "ringing" ? "Mara Vale is calling with video." : ""}
        onDecline={() => answer(null)} onAudio={() => answer("audio")} onVideo={() => answer("video")}
        pending={state === "pending" ? { label: media ? "Connecting..." : "Declining...", media } : null}
        failure={state === "failed" ? {
          title: "Couldn't answer here",
          line: "The call is still ringing in your calling app.",
          action: <Button fullWidth onClick={() => setState("ringing")}>Try again</Button>,
          announcement: "Couldn't answer here. Try again to return to the call choices.",
        } : null}
        chips={<Button size="sm" variant="plain" onClick={() => answer(null)}>Message instead</Button>}
      />
    </div>
  );
}
