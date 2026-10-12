// What agents write with native-select: snippets whose cases are in native-select.cases.ts.
import { NativeSelect } from "@/registry/ouro/components/ouro/select/native-select";

const countries = [{ value: "nz", label: "New Zealand" }];

export const nativeSelect01 = <NativeSelect label="Countries" multiple options={countries} />;
export const nativeSelect02 = <NativeSelect label="Country" helperText="Where we ship." options={countries} />;
export const okNativeSelect = <NativeSelect label="Country" name="country" placeholder="Choose a country" required options={countries} />;
