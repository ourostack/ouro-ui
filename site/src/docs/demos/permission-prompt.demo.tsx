import { type JSX } from "react";
import { PermissionPrompt } from "@/registry/ouro/components/ouro/permission-prompt/permission-prompt";

// The live demo at the top of docs/permission-prompt/: the component as an app would use it, with its props, nothing else.

export default function PermissionPromptDemo(): JSX.Element {
  return (
    <div className="grid w-full max-w-xl gap-3">
      <PermissionPrompt
        headingLevel={2}
        title="Your agent wants to run a command"
        detail="npm install recipe-scaler"
        reason="To add the package that scales a recipe for six."
        risk="medium"
        onAllow={() => {}}
        onDeny={() => {}}
      />
      <PermissionPrompt
        headingLevel={2}
        title="Research helper wants to edit a file"
        detail="recipes/roast.md"
        reason="To fix the oven temperature in step two."
        risk="low"
        answer={{ decision: "allowed", by: "Ana", app: "their phone", at: "9:41" }}
      />
    </div>
  );
}
