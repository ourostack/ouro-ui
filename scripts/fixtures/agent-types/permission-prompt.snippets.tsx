// What agents write with permission-prompt: snippets whose cases are in permission-prompt.cases.ts.
import { PermissionPrompt } from "@/registry/ouro/components/ouro/permission-prompt/permission-prompt";

export const permissionPrompt01 = <PermissionPrompt title="Your agent wants to run a command" onApprove={() => {}} />;
export const permissionPrompt02 = <PermissionPrompt title="Your agent wants to run a command" command="npm install" />;
export const permissionPrompt03 = <PermissionPrompt title="Your agent wants to run a command" description="To add the package" />;
export const permissionPromptOk01 = <PermissionPrompt title="Your agent wants to run a command" detail="npm install" reason="To add the package" risk="medium" onAllow={() => {}} onDeny={() => {}} answering="allow" answer={{ decision: "allowed", by: "Ana", app: "their phone", at: "9:41" }} allowLabel="Allow" denyLabel="Not now" headingLevel={2} className="max-w-xl" />;
