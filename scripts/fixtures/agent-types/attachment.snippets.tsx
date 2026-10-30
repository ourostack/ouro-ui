// What agents write with attachment: snippets whose cases are in attachment.cases.ts.
import { Attachment } from "@/registry/ouro/components/ouro/message/attachment";

export const attachment01 = <Attachment name="menu.pdf" url="/menu.pdf" />;
export const attachment02 = <Attachment name="menu.pdf" onDelete={() => {}} />;
export const attachment03 = <Attachment name="menu.pdf" fileName="menu.pdf" />;
export const attachment04 = <Attachment name="budget.xlsx" kind="excel" />;
export const attachmentOk01 = <Attachment name="menu.pdf" href="/menu.pdf" download size={2048} contentType="application/pdf" onRemove={() => {}} removeLabel={(name) => `Remove ${name}`} />;
export const attachmentOk02 = <Attachment name="crumb.jpg" contentType="image/jpeg" kind="image" icon={null} onOpen={(event) => event.preventDefault()} />;
