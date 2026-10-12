import { useState, type JSX, type SVGProps } from "react";
import { Toggle } from "@/registry/ouro/components/ouro/toggle/toggle";

// The live demo at the top of docs/toggle/: the component as an app would use it, with its props, nothing else.

function BoldIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
    </svg>
  );
}

export default function ToggleDemo(): JSX.Element {
  const [bold, setBold] = useState(true);
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Toggle label="Bold" icon={BoldIcon} hideLabel pressed={bold} onPressedChange={setBold} />
      <Toggle label="Show completed" variant="outline" />
    </div>
  );
}
