import { TypingIndicator } from "@/components/ouro/typing-indicator/typing-indicator";

// expect: data-ouro="typing-indicator"
// expect: Ana Lind is writing…
export default function TypingIndicatorSection() {
  return <TypingIndicator people={[{ name: "Ana Lind" }]} />;
}
