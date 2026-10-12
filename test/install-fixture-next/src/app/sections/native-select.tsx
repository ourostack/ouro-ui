import { NativeSelect } from "@/components/ouro/select/native-select";

// expect: Ouro native select
// expect: Choose a country
// expect: New Zealand
export default function NativeSelectSection() {
  return <NativeSelect label="Ouro native select" name="country" placeholder="Choose a country" required options={[{ value: "nz", label: "New Zealand" }]} />;
}
