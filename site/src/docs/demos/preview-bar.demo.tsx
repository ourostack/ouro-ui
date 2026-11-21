import { useState, type JSX } from "react";
import { PreviewBar } from "@/registry/ouro/components/ouro/preview-bar/preview-bar";

// The live demo at the top of docs/preview-bar/: the component as an app would use it, with its props, nothing else.

export default function PreviewBarDemo(): JSX.Element {
  const [comparing, setComparing] = useState(false);
  return (
    <div className="max-w-md space-y-3">
      <p className="m-0 text-sm">{comparing ? "The original theme" : "The Ocean theme"}</p>
      <PreviewBar label="Trying the Ocean theme" onKeep={() => {}} onDiscard={() => {}} onCompareChange={setComparing} />
    </div>
  );
}
