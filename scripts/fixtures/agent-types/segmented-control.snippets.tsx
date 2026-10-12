// What agents write with segmented-control: snippets whose cases are in segmented-control.cases.ts.
import { SegmentedControl } from "@/registry/ouro/components/ouro/segmented-control/segmented-control";

const items = [{ value: "list", label: "List" }];

export const segmentedControl01 = <SegmentedControl label="View" options={items} items={items} />;
export const segmentedControl02 = <SegmentedControl label="View" items={items} onChange={() => {}} />;
export const segmentedControlOk01 = <SegmentedControl label="View" hideLabel items={items} defaultValue="list" fullWidth name="view" onValueChange={() => {}} />;
