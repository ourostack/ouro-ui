import { Resizable, ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ouro/resizable/resizable";

// expect: data-ouro="resizable"
// expect: aria-label="Resize Files"
// expect: aria-valuenow="30"
// expect: aria-label="Drag Preview"
export default function ResizableSection() {
  return (
    <>
      <div style={{ height: 120 }}>
        <Resizable autoSaveId="next-section">
          <ResizablePanel label="Files" defaultSize={30}>
            Files
          </ResizablePanel>
          <ResizablePanel label="Editor">Editor</ResizablePanel>
        </Resizable>
      </div>
      <div style={{ height: 120 }}>
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel label="Preview">Preview</ResizablePanel>
          <ResizableHandle label="Drag {panel}" />
          <ResizablePanel label="Console">Console</ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </>
  );
}
