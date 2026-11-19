// What agents write with typing-indicator: snippets whose cases are in typing-indicator.cases.ts.
import { TypingIndicator } from "@/registry/ouro/components/ouro/typing-indicator/typing-indicator";

export const typingIndicator01 = <TypingIndicator people={[]} users={[{ name: "Ned Land" }]} />;
export const typingIndicator02 = <TypingIndicator people={[]} visible />;
export const typingIndicatorOk01 = <TypingIndicator people={[{ name: "Ned Land", src: "/ned.webp", idForColor: "u-1", initials: "N" }]} label={(names) => `${names.join(", ")} écrit…`} className="px-4" />;
