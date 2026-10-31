// What agents write with toggle-group: snippets whose cases are in toggle-group.cases.ts.
import { ToggleGroup } from "@/registry/ouro/components/ouro/toggle/toggle-group";

export const toggleGroup01 = <ToggleGroup label="Style" type="multiple" items={[{ value: "bold", label: "Bold" }]} />;
export const toggleGroup02 = <ToggleGroup label="Style" options={[{ value: "bold", label: "Bold" }]} items={[]} />;
export const toggleGroup03 = <ToggleGroup label="Show" shape="rounded" items={[{ value: "all", label: "All" }]} />;
export const toggleGroupOk = <ToggleGroup label="Style" hideLabel multiple items={[{ value: "bold", label: "Bold" }]} defaultValue={["bold"]} variant="outline" />;
export const toggleGroupPillOk = <ToggleGroup label="Show" hideLabel items={[{ value: "all", label: "All" }]} variant="outline" shape="pill" size="xs" />;
