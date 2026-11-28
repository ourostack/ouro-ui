import { PermissionPrompt } from "@/components/ouro/permission-prompt/permission-prompt";

// expect: data-ouro="permission-prompt"
// expect: Rendered on the server
export default function PermissionPromptSection() {
  return <PermissionPrompt title="Rendered on the server" detail="npm install" risk="low" answer={{ decision: "allowed", by: "Ana" }} />;
}
