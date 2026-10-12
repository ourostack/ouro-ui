import { Attachment } from "@/components/ouro/message/attachment";

// The link, the file's name and its size are in the server HTML.
// expect: href="/ouro-attachment.pdf"
// expect: ouro-attachment.pdf
// expect: 2 kB
export default function AttachmentSection() {
  return <Attachment name="ouro-attachment.pdf" size={2048} href="/ouro-attachment.pdf" />;
}
