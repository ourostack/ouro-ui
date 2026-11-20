// What agents write with toggle: snippets whose cases are in toggle.cases.ts.
import { Toggle } from "@/registry/ouro/components/ouro/toggle/toggle";
import { Plus } from "./helpers.ts";

export const toggle01 = <Toggle label="Bold" checked />;
export const toggle02 = <Toggle label="Bold" onCheckedChange={() => {}} />;
export const toggle03 = <Toggle label="Bold" variant="default" />;
export const toggle04 = <Toggle label="Bold" isPressed />;
export const toggleOk = <Toggle label="Bold" icon={Plus} hideLabel pressed onPressedChange={() => {}} variant="outline" size="sm" />;
