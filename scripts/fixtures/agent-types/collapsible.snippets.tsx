// What agents write with collapsible: snippets whose cases are in collapsible.cases.ts.
import { Collapsible } from "@/registry/ouro/components/ouro/collapsible/collapsible";

export const collapsible01 = <Collapsible title="Nutrition facts" trigger={<button>Open</button>}>Calories</Collapsible>;
export const collapsible02 = <Collapsible title="Nutrition facts" isOpen>Calories</Collapsible>;
export const collapsibleOk01 = <Collapsible title="Nutrition facts" defaultOpen onOpenChange={() => {}}>Calories</Collapsible>;
