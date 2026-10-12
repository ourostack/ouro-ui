import { type JSX } from "react";
import { NativeSelect } from "@/registry/ouro/components/ouro/select/native-select";

// The live demo at the top of docs/native-select/: the component as an app would use it, with its props, nothing else.

const countries = [
  { value: "au", label: "Australia" },
  { value: "nz", label: "New Zealand" },
  { value: "gb", label: "United Kingdom" },
  { value: "us", label: "United States" },
];

export default function NativeSelectDemo(): JSX.Element {
  return (
    <div className="grid w-full max-w-sm gap-4">
      <NativeSelect label="Country" name="country" autoComplete="country" placeholder="Choose a country" required options={countries} description="Where we ship the box." />
    </div>
  );
}
