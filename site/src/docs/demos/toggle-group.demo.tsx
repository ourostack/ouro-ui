import { useState, type JSX, type ReactNode, type SVGProps } from "react";
import { ToggleGroup } from "@/registry/ouro/components/ouro/toggle/toggle-group";

// The live demo at the top of docs/toggle-group/: the component as an app would use it, with its props, nothing else.

function icon(path: ReactNode) {
  return function Icon(props: SVGProps<SVGSVGElement>): JSX.Element {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
        {path}
      </svg>
    );
  };
}
const BoldIcon = icon(<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />);
const ItalicIcon = icon(<path d="M14 5h-4M14 19h-4M14 5l-4 14" />);
const UnderlineIcon = icon(<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" />);

export default function ToggleGroupDemo(): JSX.Element {
  const [styles, setStyles] = useState<string[]>(["bold"]);
  const [align, setAlign] = useState<string | null>("left");
  return (
    <div className="grid justify-items-center gap-4">
      <ToggleGroup
        label="Text style"
        hideLabel
        multiple
        items={[
          { value: "bold", label: "Bold", icon: BoldIcon, hideLabel: true },
          { value: "italic", label: "Italic", icon: ItalicIcon, hideLabel: true },
          { value: "underline", label: "Underline", icon: UnderlineIcon, hideLabel: true },
        ]}
        value={styles}
        onValueChange={setStyles}
      />
      <ToggleGroup
        label="Alignment"
        variant="outline"
        items={[
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
          { value: "right", label: "Right" },
        ]}
        value={align}
        onValueChange={setAlign}
      />
    </div>
  );
}
