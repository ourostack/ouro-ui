import { type JSX } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { PageHeader } from "@/registry/ouro/components/ouro/page-header/page-header";

// The live demo at the top of docs/page-header/: the component as an app would use it, with its props, nothing else.

export default function PageHeaderDemo(): JSX.Element {
  return (
    <PageHeader
      level={2}
      eyebrow="Settings"
      title="Billing"
      description="Your plan, invoices and payment method."
      actions={<Button>Change plan</Button>}
      className="max-w-2xl"
    />
  );
}
