// What agents write with inspector: snippets whose cases are in inspector.cases.ts.
import { Inspector } from "@/registry/ouro/components/ouro/inspector/inspector";

const docsHref = (item: string) => `https://ourostack.github.io/ouro-ui/docs/${item}/`;
const setXray = () => {};

export const inspector01 = <Inspector open onOpenChange={setXray} docsHref={docsHref} onClose={() => {}} />;
export const inspectorOk01 = <Inspector open onOpenChange={setXray} docsHref={docsHref} label="X-ray" />;
