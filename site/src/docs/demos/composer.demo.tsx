import { useRef, useState, type JSX, type ReactNode, type SVGProps } from "react";
import { Composer, type ComposerEditor } from "@/registry/ouro/components/ouro/composer/composer";
import { CodeBlock } from "@/registry/ouro/components/ouro/code-block/code-block";
import { Collapsible } from "@/registry/ouro/components/ouro/collapsible/collapsible";
import { Toolbar } from "@/registry/ouro/components/ouro/toolbar/toolbar";
import { announce } from "@/registry/ouro/lib/ouro/announce";

// The live demo at the top of docs/composer/: the component as an app would use it, with its props, nothing else.

const draft = "@[Noor](noor), let's make Friday a little special.\n\nFor the table:\n- Warm bread and something sparkling\n- Your favourite cake\n\nOur evening:\n1. Meet in the garden at six.\n2. Stay for [the sunset](https://example.com/friday).\n\n**I'll bring the lanterns.**";

function icon(path: ReactNode) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
        {path}
      </svg>
    );
  };
}
const BoldIcon = icon(<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />);
const ItalicIcon = icon(<path d="M14 5h-4M14 19h-4M14 5l-4 14" />);
const BulletsIcon = icon(<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />);
const NumbersIcon = icon(<path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M4 14h3l-3 4h3" />);

export default function ComposerDemo(): JSX.Element {
  const editor = useRef<ComposerEditor>(null);
  const [expanded, setExpanded] = useState(true);
  const [height, setHeight] = useState<number | null>(null);
  const [sent, setSent] = useState<string>();
  const [receiptOpen, setReceiptOpen] = useState(false);
  return (
    <div className="grid w-full max-w-lg gap-4">
      <Composer
        editorRef={editor}
        label="Plan a Friday gathering"
        placeholder="What's next?"
        format="rich"
        defaultValue={draft}
        expanded={expanded}
        onExpandedChange={setExpanded}
        expandLabel="Long compose"
        expandedRows={8}
        expandedMaxRows={16}
        maxRows={6}
        resizable
        resizeLabel="Resize your draft"
        tallest={() => Math.min(480, Math.floor((window.visualViewport?.height ?? window.innerHeight) * 0.6))}
        height={height}
        onHeightChange={setHeight}
        toolbar={
          <Toolbar
            label="Message formatting"
            size="sm"
            keepFocus
            items={[
              { label: "Bold", icon: BoldIcon, hideLabel: true, shortcut: ["mod", "b"], onClick: () => editor.current?.format("bold") },
              { label: "Italic", icon: ItalicIcon, hideLabel: true, shortcut: ["mod", "i"], onClick: () => editor.current?.format("italic") },
              { type: "separator" },
              { label: "Bulleted list", icon: BulletsIcon, hideLabel: true, onClick: () => editor.current?.format("bullets") },
              { label: "Numbered list", icon: NumbersIcon, hideLabel: true, onClick: () => editor.current?.format("numbers") },
            ]}
          />
        }
        onSend={(text) => {
          setSent(text);
          setReceiptOpen(false);
          setExpanded(false);
          setHeight(null);
          announce("Sent in this demo");
        }}
      />
      {sent !== undefined && (
        <Collapsible title="Sent in this demo - view Markdown" open={receiptOpen} onOpenChange={setReceiptOpen}>
          <CodeBlock title="Markdown" language="markdown" code={sent} wrap />
        </Collapsible>
      )}
    </div>
  );
}
