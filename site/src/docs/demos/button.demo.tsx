import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { PlusIcon } from "../../components/icons";
import { wait } from "./wait";

// The live demo at the top of docs/button/: the component as an app would use it, with its props, nothing else.

export default function ButtonDemo(): JSX.Element {
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button
        loading={saving}
        loadingLabel="Saving recipe"
        onClick={() => {
          setSaving(true);
          void wait(1600).then(() => setSaving(false));
        }}
      >
        Save recipe
      </Button>
      <Button variant="soft" startIcon={PlusIcon}>
        Add step
      </Button>
      <Button variant="outline" tone="secondary">
        Cancel
      </Button>
      <Button variant="soft" tone="destructive">
        Delete
      </Button>
    </div>
  );
}
