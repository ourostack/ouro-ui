// What agents write with checklist: snippets whose cases are in checklist.cases.ts.
import { Checklist } from "@/registry/ouro/components/ouro/checklist/checklist";

const items = [{ id: "oats", label: "rolled oats", value: "1 cup", checked: false }];
const mark = () => {};

export const checklist01 = <Checklist label="Ingredients" items={items} onCheckedChange={mark} onChange={() => {}} />;
export const checklist02 = <Checklist label="Ingredients" items={items} onCheckedChange={mark} onToggle={() => {}} />;
export const checklist03 = <Checklist label="Ingredients" items={items} onCheckedChange={mark} legend="Ingredients" />;
export const checklist04 = <Checklist label="Steps" items={items} onCheckedChange={mark} sequential />;
export const checklist05 = <Checklist label="Steps" items={items} onCheckedChange={mark} variant="card" />;
export const checklist06 = <Checklist label="Steps" items={[{ id: "boil", label: "Boil the water", icon: <svg />, checked: false }]} onCheckedChange={mark} />;
export const checklistOk01 = <Checklist label="Ingredients" description="For two bowls." items={items} onCheckedChange={mark} onClearChecked={() => {}} clearLabel="Start over" empty="Nothing yet." />;
export const checklistOk02 = <Checklist label="Steps" items={items} onCheckedChange={mark} ordered={["oats"]} outOfOrderLabel={(first) => `First: ${first}`} />;
export const checklistOk03 = <Checklist label="Steps" variant="outline" items={[{ id: "boil", label: "Boil the water", media: <svg />, checked: false }]} onCheckedChange={mark} ordered />;
