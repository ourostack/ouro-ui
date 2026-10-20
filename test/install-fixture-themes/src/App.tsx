import { useState } from "react";
import { Button } from "~/components/ouro/button/button";
import { Checklist } from "~/components/ouro/checklist/checklist";
import { Dialog } from "~/components/ouro/dialog/dialog";

// The copy-theme install proof's app (site/scripts/theme-install-test.sh): the voyage page's
// theme sample (site/src/voyage/repaint.tsx), the same Checklist rows and Dialog, in a clean
// shadcn app whose stylesheet ends with one preset's copied CSS.
const CHECKS = [
  { id: "hatch", label: "Close the hatch" },
  { id: "tanks", label: "Fill the ballast tanks" },
  { id: "lights", label: "Test the lantern" },
  { id: "ned", label: "Find Ned Land" },
];

export function App() {
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(["hatch"]));
  const [open, setOpen] = useState(false);
  return (
    <main style={{ display: "grid", gap: 24, maxWidth: 480, margin: "48px auto", padding: 16 }}>
      <Checklist
        label="Before we dive"
        description="Tick them off. Conseil is watching."
        items={CHECKS.map((item) => ({ ...item, checked: checked.has(item.id) }))}
        onCheckedChange={(id, isChecked) =>
          setChecked((previous) => {
            const next = new Set(previous);
            if (isChecked) next.add(id);
            else next.delete(id);
            return next;
          })
        }
        onClearChecked={() => setChecked(new Set())}
      />
      <Dialog
        title="Dive to 300 fathoms?"
        description="The lantern stays on. Ned Land would like it noted that he is against this."
        open={open}
        onOpenChange={setOpen}
        footer={
          <>
            <Button variant="outline" tone="secondary" onClick={() => setOpen(false)}>
              Not yet
            </Button>
            <Button onClick={() => setOpen(false)}>Dive</Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>At 300 fathoms the sea is dark and very quiet. Captain Nemo says the fish there glow.</p>
      </Dialog>
      <Button onClick={() => setOpen(true)} aria-haspopup="dialog">
        Ready to dive?
      </Button>
    </main>
  );
}
