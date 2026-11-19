import { AppWindow } from "@/components/ouro/app-window/app-window";

// expect: data-ouro="app-window"
// expect: Ouro app window
export default function AppWindowSection() {
  return (
    <AppWindow title="Ouro app window" builtWith={["AppWindow"]}>
      Rendered on the server
    </AppWindow>
  );
}
