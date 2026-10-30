import { Toolbar } from "@/components/ouro/toolbar/toolbar";

// expect: data-ouro="toolbar"
// expect: role="toolbar"
// expect: aria-label="Formatting"
// expect: aria-pressed="true"
// expect: aria-keyshortcuts="Control+B Meta+B"
export default function ToolbarSection() {
  return (
    <Toolbar
      label="Formatting"
      items={[
        { type: "toggle", label: "Bold", shortcut: ["mod", "b"], defaultPressed: true },
        { type: "separator" },
        { label: "Insert link" },
      ]}
    />
  );
}
