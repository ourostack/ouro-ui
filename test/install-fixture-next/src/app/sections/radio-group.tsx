import { Radio, RadioGroup } from "@/components/ouro/radio-group/radio-group";

// expect: Ouro radio group
// expect: Radio description
// expect: role="radiogroup"[^>]*aria-labelledby="[^"]*-label"
export default function RadioGroupSection() {
  return (
    <RadioGroup legend="Ouro radio group" name="size" defaultValue="small">
      <Radio value="small" label="Small" description="Radio description" />
      <Radio value="large" label="Large" />
    </RadioGroup>
  );
}
