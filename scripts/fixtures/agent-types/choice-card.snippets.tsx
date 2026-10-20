// What agents write with choice-card: snippets whose cases are in choice-card.cases.ts.
import { ChoiceCard } from "@/registry/ouro/components/ouro/choice-card/choice-card";

const items = [{ value: "a", label: "A" }, { value: "b", label: "B" }];

export const choiceCard01 = <ChoiceCard legend="Plan" items={items} label="Plan" />;
export const choiceCard02 = <ChoiceCard legend="Plan" items={items} columns={5} />;
export const choiceCardOk01 = <ChoiceCard legend="Plan" items={items} name="plan" defaultValue="a" columns={2} required className="mt-6" />;
