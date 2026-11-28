import { lazy, Suspense, useLayoutEffect, useRef, useState, type JSX, type ReactNode, type SVGProps } from "react";
import { Composer, type ComposerEditor } from "@/registry/ouro/components/ouro/composer/composer";
import { Autocomplete, type AutocompleteItem } from "@/registry/ouro/components/ouro/autocomplete/autocomplete";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { CodeBlock } from "@/registry/ouro/components/ouro/code-block/code-block";
import { Collapsible } from "@/registry/ouro/components/ouro/collapsible/collapsible";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { Toolbar } from "@/registry/ouro/components/ouro/toolbar/toolbar";
import { announce } from "@/registry/ouro/lib/ouro/announce";

// The live demo at the top of docs/composer/: the component as an app would use it, with its props, nothing else.

const preview = import("./composer-preview");
const Preview = lazy(() => preview);
const draft = "@[Noor](noor), **Friday at six?**\n\n1. Bring bread.\n2. Catch the [sunset](https://www.timeanddate.com/sun/).";
const people: AutocompleteItem[] = [
  { value: "noor", label: "Noor", insert: "" },
  { value: "avery", label: "Avery", insert: "" },
  { value: "jules", label: "Jules", insert: "" },
];

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
const LinkIcon = icon(<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" />);

export default function ComposerDemo(): JSX.Element {
  const editor = useRef<ComposerEditor>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(draft);
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState<number | null>(null);
  const [sent, setSent] = useState<string>();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const wasSent = useRef(false);
  useLayoutEffect(() => {
    if (sent !== undefined) keepEditing.current?.focus();
    else if (wasSent.current) input.current?.focus();
    wasSent.current = sent !== undefined;
  }, [sent]);
  return (
    <div className="grid w-full max-w-lg gap-4">
      <div hidden={sent !== undefined}>
      <Autocomplete triggers={[{
        char: "@",
        label: "People",
        items: people,
        onPick: (item) => editor.current!.insert(`@[${item.label}](${item.value}) `, { format: "markdown" }),
      }]}>
        <Composer
          ref={input}
          editorRef={editor}
          label="Plan a Friday gathering"
          placeholder="Write..."
          format="rich"
          value={text}
          onValueChange={(next) => {
            setText(next);
            if (!next.trim()) setHeight(null);
            setSent(undefined);
            setReceiptOpen(false);
          }}
          expanded={expanded}
          onExpandedChange={setExpanded}
          expandLabel="Long compose"
          description="Type @ for people. Nothing is sent."
          expandedRows={6}
          expandedMaxRows={16}
          maxRows={4}
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
                { label: "Link", icon: LinkIcon, hideLabel: true, shortcut: ["mod", "k"], onClick: () => editor.current?.format("link") },
                { type: "separator" },
                { label: "Bulleted list", icon: BulletsIcon, hideLabel: true, onClick: () => editor.current?.format("bullets") },
                { label: "Numbered list", icon: NumbersIcon, hideLabel: true, onClick: () => editor.current?.format("numbers") },
              ]}
            />
          }
          onSend={(text) => {
            setSent(text);
            setReceiptOpen(false);
            announce("Invitation preview ready.");
          }}
        />
      </Autocomplete>
      </div>
      {sent === undefined && text !== draft && (
            <Button
              variant="plain"
              tone="secondary"
              size="sm"
              onClick={() => {
                input.current?.focus();
                setText(draft);
                setSent(undefined);
                setReceiptOpen(false);
                setHeight(null);
                setExpanded(false);
                announce("Example restored");
              }}
            >
              Restore example
            </Button>
      )}
      {sent !== undefined && (
        <>
          <Suspense fallback={<Text role="status">Preparing your invitation...</Text>}>
            <Preview text={sent} />
          </Suspense>
          <Button ref={keepEditing} variant="plain" tone="secondary" onClick={() => setSent(undefined)}>Back to draft</Button>
          <Collapsible title="View sent Markdown" open={receiptOpen} onOpenChange={setReceiptOpen}>
            <CodeBlock code={sent} wrap />
          </Collapsible>
        </>
      )}
    </div>
  );
}
