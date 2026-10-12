import { type JSX } from "react";
import { Select } from "@/registry/ouro/components/ouro/select/select";

// The live demo at the top of docs/select/: the component as an app would use it, with its props, nothing else.

const courses = [
  { value: "starter", label: "Starter" },
  { value: "main", label: "Main" },
  { value: "side", label: "Side" },
  { value: "dessert", label: "Dessert" },
];

const tags = [
  { label: "Diet", options: [{ value: "vegan", label: "Vegan" }, { value: "gluten-free", label: "Gluten-free" }] },
  { label: "Time", options: [{ value: "quick", label: "Under 30 minutes" }, { value: "slow", label: "Slow cooked" }] },
];

export default function SelectDemo(): JSX.Element {
  return (
    <div className="grid w-full max-w-sm gap-4">
      <Select label="Course" name="course" placeholder="Choose a course" options={courses} description="Where it sits in the menu." />
      <Select label="Tags" name="tags" multiple placeholder="Add tags" options={tags} defaultValue={["quick"]} />
    </div>
  );
}
