import { type JSX } from "react";
import { AppWindow } from "@/registry/ouro/components/ouro/app-window/app-window";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";

// The live demo at the top of docs/app-window/: the component as an app would use it, with its props, nothing else.

export default function AppWindowDemo(): JSX.Element {
  return (
    <AppWindow
      title="kettle.tsx"
      actions={
        <Button variant="plain" tone="secondary" size="sm">
          Code
        </Button>
      }
      builtWith={["Switch", "Button"]}
      className="w-full max-w-xl"
    >
      <div className="py-5">
        <Switch label="Keep the kettle warm" />
      </div>
    </AppWindow>
  );
}
