import { SectionHeader } from "@/components/ouro/section-header/section-header";

// expect: data-ouro="section-header"
// expect: Ouro section header
export default function SectionHeaderSection() {
  return <SectionHeader title="Ouro section header" meta="Rendered on the server" />;
}
