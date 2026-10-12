import { useState, type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Sheet } from "@/registry/ouro/components/ouro/sheet/sheet";
import { CheckIcon, PlusIcon } from "../../components/icons";

// The live demo at the top of docs/sheet/: the component as an app would use it, with its props, nothing else.

function CookbookList(): JSX.Element {
  const [saved, setSaved] = useState<ReadonlySet<string>>(() => new Set(["Weeknights"]));
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {["Weeknights", "Summer", "For guests"].map((name) => {
        const on = saved.has(name);
        return (
          <li key={name}>
            <Button
              fullWidth
              variant={on ? "soft" : "outline"}
              tone={on ? "primary" : "secondary"}
              startIcon={on ? CheckIcon : PlusIcon}
              aria-pressed={on}
              onClick={() =>
                setSaved((current) => {
                  const next = new Set(current);
                  if (!next.delete(name)) next.add(name);
                  return next;
                })
              }
            >
              {name}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export default function SheetDemo(): JSX.Element {
  return (
    <Sheet title="Save to cookbook" description="Pick one or more." trigger={<Button>Save to cookbook</Button>}>
      <CookbookList />
    </Sheet>
  );
}
