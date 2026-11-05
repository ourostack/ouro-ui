// What agents write with toolbar: snippets whose cases are in toolbar.cases.ts.
import { Toolbar } from "@/registry/ouro/components/ouro/toolbar/toolbar";

export const toolbar01 = <Toolbar label="Formatting" orientation="vertical" items={[{ label: "Bold" }]} />;
export const toolbar02 = <Toolbar label="Formatting" items={[{ label: "Bold", shortcut: "mod+b" }]} />;
export const toolbar03 = <Toolbar items={[{ label: "Bold" }]} />;
export const toolbar04 = <Toolbar label="Call controls" floating autoHide items={[{ label: "Leave" }]} />;
export const toolbar05 = <Toolbar label="Call controls" glass items={[{ label: "Leave" }]} />;
export const toolbar06 = <Toolbar label="Call controls" autoHideDuration={3000} items={[{ label: "Leave" }]} />;
export const toolbar07 = <Toolbar label="Call controls" autoHide={3000} area={document.body} items={[{ label: "Leave" }]} />;
export const toolbar08 = <Toolbar label="Call controls" autoHide={3000} visible items={[{ label: "Leave" }]} />;
export const toolbar09 = <Toolbar label="Call controls" autoHide={3000} hidden={false} items={[{ label: "Leave" }]} />;
export const toolbar10 = <Toolbar label="Call controls" hidden={false} items={[{ label: "Leave" }]} />;
export const toolbarOk = <Toolbar label="Formatting" size="sm" keepFocus moreLabel="More formatting" items={[{ type: "toggle", label: "Bold", shortcut: ["mod", "b"], defaultPressed: true }, { type: "separator" }, { type: "group", label: "Lists", items: [{ label: "Bulleted list", onClick: () => {} }] }]} className="flex-1" />;
export const toolbarOk02 = <Toolbar label="Call controls" floating autoHide={3000} onHiddenChange={(hidden) => void hidden} items={[{ type: "toggle", label: "Mute" }, { type: "separator" }, { label: "Leave", onClick: () => {} }]} />;
export const toolbarOk03 = <Toolbar label="Call controls" floating autoHide={3000} autoHideArea={{ current: null }} items={[{ label: "Leave" }]} />;
export const toolbarOk04 = <Toolbar label="Call controls" floating autoHide={3000} hidden={false} onHiddenChange={(hidden) => void hidden} items={[{ type: "toggle", label: "Mute", shortcut: ["shift", "mod", "m"] }]} />;
