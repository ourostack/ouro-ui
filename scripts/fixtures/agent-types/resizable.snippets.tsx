// What agents write with resizable: snippets whose cases are in resizable.cases.ts.
import { Resizable, ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/registry/ouro/components/ouro/resizable/resizable";

export const resizable01 = <ResizablePanelGroup direction="horizontal"><ResizablePanel label="Files">Files</ResizablePanel><ResizableHandle /><ResizablePanel label="Editor">Editor</ResizablePanel></ResizablePanelGroup>;
export const resizable02 = <Resizable><ResizablePanel defaultSize={50}>Files</ResizablePanel><ResizablePanel label="Editor">Editor</ResizablePanel></Resizable>;
export const resizable03 = <ResizablePanelGroup><ResizablePanel label="Files">Files</ResizablePanel><ResizableHandle withHandle /><ResizablePanel label="Editor">Editor</ResizablePanel></ResizablePanelGroup>;
export const resizableOk01 = <Resizable orientation="vertical" autoSaveId="editor" handleLabel="Resize {panel}" onLayout={() => {}} className="h-96"><ResizablePanel label="Files" defaultSize={30} minSize={20} maxSize={60} id="files" className="p-4">Files</ResizablePanel><ResizablePanel label="Editor">Editor</ResizablePanel></Resizable>;
export const resizableOk02 = <ResizablePanelGroup orientation="horizontal" autoSaveId="preview"><ResizablePanel label="Preview">Preview</ResizablePanel><ResizableHandle aria-label="Resize the preview" /><ResizablePanel label="Console">Console</ResizablePanel></ResizablePanelGroup>;
