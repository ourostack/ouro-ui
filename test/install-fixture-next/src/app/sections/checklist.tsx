import { Checklist } from "@/components/ouro/checklist/checklist";

async function markIngredient(_id: string, _checked: boolean) {
  "use server";
}

// expect: Ouro checklist
// expect: rolled oats
// Checklist names its group and each row's box in the server HTML.
// expect: role="group"[^>]*aria-labelledby="[^"]*-label"
// expect: role="checkbox"[^>]*aria-checked="true"
export default function ChecklistSection() {
  return (
    <Checklist
      label="Ouro checklist"
      items={[
        { id: "oats", label: "rolled oats", value: "1 cup", checked: true },
        { id: "milk", label: "milk", checked: false },
      ]}
      onCheckedChange={markIngredient}
    />
  );
}
