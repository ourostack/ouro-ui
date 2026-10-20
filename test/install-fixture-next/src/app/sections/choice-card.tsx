import { ChoiceCard } from "@/components/ouro/choice-card/choice-card";

// expect: data-ouro="choice-card"
// expect: Ouro choice
// expect: name="ouro-choice"
export default function ChoiceCardSection() {
  return <ChoiceCard legend="Ouro choice" name="ouro-choice" defaultValue="a" items={[{ value: "a", label: "First" }, { value: "b", label: "Second" }]} />;
}
