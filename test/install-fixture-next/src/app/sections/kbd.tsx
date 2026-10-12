import { Kbd } from "@/components/ouro/kbd/kbd";

// The server can't know the platform, so it renders the key names.
// expect: data-platform="unknown"
// expect: Ctrl
export default function KbdSection() {
  return <Kbd keys={["mod", "k"]} />;
}
