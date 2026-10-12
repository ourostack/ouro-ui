import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Progress } from "@/registry/ouro/components/ouro/progress/progress";

// The live demo at the top of docs/progress/: the component as an app would use it, with its props, nothing else.

export default function ProgressDemo(): JSX.Element {
  const [value, setValue] = useState(40);
  return (
    <div className="grid w-full max-w-sm gap-6">
      <Progress label="Uploading photos" value={value} showValue />
      <Progress label="Importing recipes" value={null} />
      <div className="flex gap-3">
        <Button size="sm" variant="outline" tone="secondary" onClick={() => setValue((current) => Math.max(0, current - 20))}>
          Less
        </Button>
        <Button size="sm" variant="outline" tone="secondary" onClick={() => setValue((current) => Math.min(100, current + 20))}>
          More
        </Button>
      </div>
    </div>
  );
}
