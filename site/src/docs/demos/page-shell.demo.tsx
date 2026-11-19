import { type JSX } from "react";
import { PageSection, PageShell } from "@/registry/ouro/components/ouro/page-shell/page-shell";

// The live demo at the top of docs/page-shell/: the components as an app would use them, with their props, nothing else.

export default function PageShellDemo(): JSX.Element {
  return (
    <PageShell>
      <PageSection aria-label="Work">Work</PageSection>
      <PageSection aria-label="Notes">Notes</PageSection>
    </PageShell>
  );
}
