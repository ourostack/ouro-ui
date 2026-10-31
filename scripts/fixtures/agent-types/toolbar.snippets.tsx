// What agents write with toolbar: snippets whose cases are in toolbar.cases.ts.
import { Toolbar } from "@/registry/ouro/components/ouro/toolbar/toolbar";

export const toolbar01 = <Toolbar label="Formatting" orientation="vertical" items={[{ label: "Bold" }]} />;
export const toolbar02 = <Toolbar label="Formatting" items={[{ label: "Bold", shortcut: "mod+b" }]} />;
export const toolbar03 = <Toolbar items={[{ label: "Bold" }]} />;
export const toolbarOk = <Toolbar label="Formatting" size="sm" keepFocus moreLabel="More formatting" items={[{ type: "toggle", label: "Bold", shortcut: ["mod", "b"], defaultPressed: true }, { type: "separator" }, { type: "group", label: "Lists", items: [{ label: "Bulleted list", onClick: () => {} }] }]} className="flex-1" />;
