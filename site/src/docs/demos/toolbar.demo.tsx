import { useState } from "react";
import { Toolbar } from "@/registry/ouro/components/ouro/toolbar/toolbar";

export default function ToolbarDemo() {
  const [muted, setMuted] = useState(true);
  return <Toolbar label="Call controls" floating items={[
    { type: "toggle", label: "Mute", tone: "inverse", pressed: muted, onPressedChange: setMuted },
    { type: "toggle", label: "Raise hand", tone: "primary" },
    { type: "separator" },
    { label: "Leave", tone: "destructive" },
  ]} />;
}
