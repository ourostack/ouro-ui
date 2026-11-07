// What agents write with alert: snippets whose cases are in alert.cases.ts.
import { Alert } from "@/registry/ouro/components/ouro/alert/alert";

export const alert01 = <Alert title="Not saved: you're offline" variant="destructive" />;
export const alert02 = <Alert title="Not saved: you're offline" severity="error" />;
export const alert03 = <Alert title="New" status="info" />;
export const alert04 = <Alert title="Saved" onClose={() => {}} />;
export const alert05 = <Alert title="Saved">It's in your cookbook.</Alert>;
export const alert06 = <Alert title="New" tone="info" />;
export const alertOk01 = <Alert tone="destructive" title="Not saved: you're offline" description="Try again." onDismiss={() => {}} dismissLabel="Close" />;
