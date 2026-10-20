// What agents write with page-header: snippets whose cases are in page-header.cases.ts.
import { PageHeader } from "@/registry/ouro/components/ouro/page-header/page-header";

export const pageHeader01 = <PageHeader title="Billing" subtitle="Your plan and invoices." />;
export const pageHeader02 = <PageHeader title="Billing" level={3} />;
export const pageHeaderOk01 = <PageHeader eyebrow="Settings" title="Billing" description="Your plan and invoices." actions={null} level={2} size="lg" divider className="mb-8" />;
