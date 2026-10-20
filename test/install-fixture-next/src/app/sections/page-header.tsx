import { PageHeader } from "@/components/ouro/page-header/page-header";

// expect: data-ouro="page-header"
// expect: Ouro page header
export default function PageHeaderSection() {
  return <PageHeader level={2} eyebrow="Section" title="Ouro page header" description="Rendered on the server." />;
}
