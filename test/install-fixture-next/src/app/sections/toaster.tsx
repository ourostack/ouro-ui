import { Toaster } from "@/components/ouro/toast/toaster";

// Toaster renders nothing on the server; its props reach the client component in the page's payload.
// expect: Ouro notifications
export default function ToasterSection() {
  return <Toaster label="Ouro notifications" />;
}
