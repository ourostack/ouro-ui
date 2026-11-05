import { useEffect, useState, type JSX } from "react";
import { LiveCaptions, type LiveCaptionLine } from "@/registry/ouro/components/ouro/live-captions/live-captions";
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";

// The live demo at the top of docs/live-captions/: the component as an app would use it, with its props, nothing else.
// A made-up meeting stands in for a caption service: a few words at a time, interim, then final.

const script = [
  { speaker: "Mara Lind", text: "Shall we start with the plan for next week?" },
  { speaker: "Jonas Ek", text: "Yes, and then the budget, if there is time." },
  { speaker: "Mara Lind", text: "Good. The launch moves to Thursday." },
  { speaker: "Jonas Ek", text: "Thursday works for the whole team." },
];

export default function LiveCaptionsDemo(): JSX.Element {
  const [lines, setLines] = useState<LiveCaptionLine[]>([]);
  const [size, setSize] = useState<"sm" | "md" | "lg">("md");
  const [readAloud, setReadAloud] = useState(false);
  useEffect(() => {
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const index = Math.floor(step / 8);
      const { speaker, text } = script[index % script.length]!;
      const words = text.split(" ");
      const final = step % 8 === 7;
      const line = { id: `demo-${index}`, speaker, text: words.slice(0, Math.min(words.length, ((step % 8) + 1) * 2)).join(" "), final };
      setLines((current) => [...current.filter((existing) => existing.id !== line.id), line].slice(-8));
      step += 1;
      timer = setTimeout(tick, final ? 900 : 350);
    };
    timer = setTimeout(tick, 350);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="grid w-full max-w-xl gap-4">
      <LiveCaptions label="Captions" hideLabel lines={lines} size={size} announce={readAloud} />
      <div className="flex flex-wrap items-end gap-6">
        <SegmentedControl
          label="Caption size"
          items={[
            { value: "sm", label: "Small" },
            { value: "md", label: "Medium" },
            { value: "lg", label: "Large" },
          ]}
          value={size}
          onValueChange={(value) => setSize(value as typeof size)}
        />
        <Switch label="Read captions aloud" checked={readAloud} onCheckedChange={setReadAloud} />
      </div>
    </div>
  );
}
