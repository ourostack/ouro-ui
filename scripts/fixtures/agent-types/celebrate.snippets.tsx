// What agents write with celebrate: snippets whose cases are in celebrate.cases.ts.
import { Celebrate } from "@/registry/ouro/components/ouro/celebrate/celebrate";

const done = true as boolean;

export const celebrate01 = <Celebrate show={done} message="Done" open={done} />;
export const celebrateOk01 = <Celebrate show={done} message="List cleared" hideMessage className="mx-auto" />;
