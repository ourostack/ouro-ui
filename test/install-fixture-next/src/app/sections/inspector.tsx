import { Inspector } from "@/components/ouro/inspector/inspector";

async function setXray(_open: boolean) {
  "use server";
}

// expect: Ouro inspector
// Inspector renders nothing on the server, even while open: it measures the page once it has hydrated.
export default function InspectorSection() {
  return (
    <div>
      <p>Ouro inspector</p>
      <Inspector open onOpenChange={setXray} />
    </div>
  );
}
