import { type JSX } from "react";
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";

// The live demo at the top of docs/attachment/: the component as an app would use it, with its props, nothing else.

const crumbPhoto =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d97706"/><stop offset="1" stop-color="#7c2d12"/></linearGradient></defs><rect width="64" height="64" fill="url(#c)"/><circle cx="20" cy="18" r="5" fill="#fef3c7" fill-opacity=".6"/><circle cx="44" cy="30" r="7" fill="#fef3c7" fill-opacity=".5"/><circle cx="30" cy="46" r="4" fill="#fef3c7" fill-opacity=".6"/></svg>',
  );

export default function AttachmentDemo(): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      <Attachment name="sourdough.pdf" size={1_258_291} href="#sourdough" />
      <Attachment name="bake-schedule.xlsx" size={18_432} href="#schedule" />
      <Attachment name="crumb.jpg" size={348_160} contentType="image/jpeg" preview={crumbPhoto} onRemove={() => {}} />
    </div>
  );
}
