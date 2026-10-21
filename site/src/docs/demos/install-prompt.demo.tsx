import { useEffect, type JSX } from "react";
import { InstallPrompt } from "@/registry/ouro/components/ouro/install-prompt/install-prompt";

// The live demo at the top of docs/install-prompt/: the component as an app would use it, with its props, nothing else.
// These docs are not an installable app, so the demo fires the offer a browser fires for one.

export default function InstallPromptDemo(): JSX.Element {
  useEffect(() => {
    localStorage.removeItem("ouro-install-dismissed");
    window.dispatchEvent(
      Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt: () => Promise.resolve(),
        userChoice: Promise.resolve({ outcome: "dismissed" as const }),
      }),
    );
  }, []);
  return (
    <div className="max-w-sm">
      <InstallPrompt title="Take your notes offline" description="Install Field Notes to read and write notes without a connection." />
    </div>
  );
}
