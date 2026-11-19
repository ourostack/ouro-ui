import { PageSection, PageShell } from "@/components/ouro/page-shell/page-shell";

// expect: data-ouro="page-shell"
// expect: data-ouro="page-section"
export default function PageShellSection() {
  return (
    <PageShell>
      <PageSection aria-label="Work">Work</PageSection>
    </PageShell>
  );
}
