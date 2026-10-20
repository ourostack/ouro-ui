import { InstallPrompt } from "@/components/ouro/install-prompt/install-prompt";

// InstallPrompt renders nothing on the server, where no browser can have offered to install.
// expect: id="ouro-install-prompt-section"></div>
export default function InstallPromptSection() {
  return (
    <div id="ouro-install-prompt-section">
      <InstallPrompt title="Install Ouro" />
    </div>
  );
}
