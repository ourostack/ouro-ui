// What agents write with tooltip: snippets whose cases are in tooltip.cases.ts.
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Tooltip } from "@/registry/ouro/components/ouro/tooltip/tooltip";

export const tooltip01 = <Tooltip content="Save" delayDuration={0}><Button>Save</Button></Tooltip>;
export const tooltip02 = <Tooltip content="Save" asChild><Button>Save</Button></Tooltip>;
export const tooltip03 = <Tooltip title="Save"><Button>Save</Button></Tooltip>;
export const tooltipOk01 = <Tooltip content="Add to cookbook" side="bottom" align="center"><Button aria-label="Save">+</Button></Tooltip>;
