// What agents write with app-window: snippets whose cases are in app-window.cases.ts.
import { AppWindow } from "@/registry/ouro/components/ouro/app-window/app-window";

export const appWindow01 = <AppWindow title="tea.tsx" uses={["Checklist"]} />;
export const appWindow02 = <AppWindow title="tea.tsx" padded={false} />;
export const appWindowOk01 = <AppWindow title="tea.tsx" actions={null} builtWith={["Checklist", "Button"]} builtWithLabel="Built with" inset={false} className="mt-8" />;
