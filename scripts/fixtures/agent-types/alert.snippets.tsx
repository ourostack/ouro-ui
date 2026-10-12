// What agents write with alert: snippets whose cases are in alert.cases.ts.
import { Alert } from "@/registry/ouro/components/ouro/alert/alert";

export const alert01 = <Alert title="Couldn't save" variant="destructive" />;
export const alert02 = <Alert title="Couldn't save" severity="error" />;
export const alert03 = <Alert title="New" status="info" />;
export const alert04 = <Alert title="Saved" onClose={() => {}} />;
export const alert05 = <Alert title="Saved">It's in your cookbook.</Alert>;
export const alert06 = <Alert title="New" tone="info" />;
export const alertOk01 = <Alert tone="destructive" title="Couldn't save" description="Try again." onDismiss={() => {}} dismissLabel="Close" />;
