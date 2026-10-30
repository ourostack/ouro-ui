import { Composer } from "@/components/ouro/composer/composer";

// The box, its text, the description and the reason are in the server HTML.
// expect: Ouro composer
// expect: Hello from the server
// expect: Sending is off
// expect: Ouro composer note
export default function ComposerSection() {
  return <Composer label="Ouro composer" defaultValue="Hello from the server" description="Ouro composer note" sendDisabledReason="Sending is off" onSend={() => {}} />;
}
