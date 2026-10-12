// What agents write with select: snippets whose cases are in select.cases.ts.
import { Select } from "@/registry/ouro/components/ouro/select/select";
import { SelectItem } from "@/registry/ouro/components/ouro/select/select-parts";

const courses = [{ value: "main", label: "Main" }];

export const select01 = <Select label="Tags" isMulti options={courses} />;
export const select02 = <Select label="Course" options={courses} onChange={() => {}} />;
export const select03 = <Select label="Course" items={courses} />;
export const select04 = <Select label="Tags" multiple value="main" options={courses} />;
export const okSelect = <Select label="Course" name="course" placeholder="Choose a course" required options={courses} />;
export const okSelectMultiple = <Select label="Tags" name="tags" multiple defaultValue={["main"]} onValueChange={(value) => value.length}><SelectItem value="main">Main</SelectItem></Select>;
