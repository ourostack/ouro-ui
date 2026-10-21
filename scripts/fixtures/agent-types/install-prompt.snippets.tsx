// What agents write with install-prompt: snippets whose cases are in install-prompt.cases.ts.
import { InstallPrompt } from "@/registry/ouro/components/ouro/install-prompt/install-prompt";

export const installPrompt01 = <InstallPrompt open />;
export const installPrompt02 = <InstallPrompt onAccept={() => {}} />;
export const installPromptOk01 = <InstallPrompt title="Take your notes offline" installLabel="Install" remindAfterDays={7} onInstall={() => {}} className="mt-6" />;
