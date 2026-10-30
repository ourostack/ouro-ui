import { type JSX } from "react";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";

// The live demo at the top of docs/attachment/: the component as an app would use it, with its props, nothing else.

export default function AttachmentDemo(): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      <Attachment name="sourdough.pdf" size={1_258_291} href="#sourdough" />
      <Attachment name="bake-schedule.xlsx" size={18_432} href="#schedule" />
      <Attachment name="crumb.jpg" size={348_160} contentType="image/jpeg" onRemove={() => {}} />
    </div>
  );
}
