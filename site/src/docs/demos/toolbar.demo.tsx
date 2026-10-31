import { useState, type JSX, type ReactNode, type SVGProps } from "react";
import { Toolbar } from "@/registry/ouro/components/ouro/toolbar/toolbar";

// The live demo at the top of docs/toolbar/: the component as an app would use it, with its props, nothing else.

function icon(path: ReactNode) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
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
const LinkIcon = icon(<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />);
const BulletsIcon = icon(<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />);
const NumbersIcon = icon(<path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M4 14h3l-3 4h3" />);
const CodeIcon = icon(<path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />);

export default function ToolbarDemo(): JSX.Element {
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  return (
    <div className="w-full max-w-md">
      <Toolbar
        label="Formatting"
        size="sm"
        keepFocus
        items={[
          { type: "toggle", label: "Bold", icon: BoldIcon, hideLabel: true, shortcut: ["mod", "b"], pressed: bold, onPressedChange: setBold },
          { type: "toggle", label: "Italic", icon: ItalicIcon, hideLabel: true, shortcut: ["mod", "i"], pressed: italic, onPressedChange: setItalic },
          { type: "toggle", label: "Underline", icon: UnderlineIcon, hideLabel: true, shortcut: ["mod", "u"] },
          { type: "separator" },
          { label: "Insert link", icon: LinkIcon, hideLabel: true, shortcut: ["mod", "k"] },
          { type: "separator" },
          {
            type: "group",
            label: "Lists",
            items: [
              { label: "Bulleted list", icon: BulletsIcon, hideLabel: true },
              { label: "Numbered list", icon: NumbersIcon, hideLabel: true },
            ],
          },
          { type: "toggle", label: "Code", icon: CodeIcon, hideLabel: true, shortcut: ["mod", "e"] },
        ]}
      />
    </div>
  );
}
