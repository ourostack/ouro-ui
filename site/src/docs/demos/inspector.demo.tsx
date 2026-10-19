import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Inspector } from "@/registry/ouro/components/ouro/inspector/inspector";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";

// The live demo at the top of docs/inspector/: the component as an app would use it, with its props, nothing else.

export default function InspectorDemo(): JSX.Element {
  const [xray, setXray] = useState(false);
  return (
    <div className="grid w-full max-w-sm gap-4">
      <Switch label="X-ray" description="Outline every Ouro component on this page." checked={xray} onCheckedChange={setXray} />
      <Button>Save recipe</Button>
      <Inspector open={xray} onOpenChange={setXray} />
    </div>
  );
}
