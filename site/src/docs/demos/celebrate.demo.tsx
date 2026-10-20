import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Celebrate } from "@/registry/ouro/components/ouro/celebrate/celebrate";

// The live demo at the top of docs/celebrate/: the component as an app would use it, with its props, nothing else.

export default function CelebrateDemo(): JSX.Element {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button variant={done ? "outline" : "solid"} tone={done ? "secondary" : "primary"} onClick={() => setDone(!done)}>
        {done ? "Undo" : "Finish the task"}
      </Button>
      <Celebrate show={done} message="Task complete" />
    </div>
  );
}
