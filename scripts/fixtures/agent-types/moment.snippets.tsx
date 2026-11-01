// What agents write with moment: snippets whose cases are in moment.cases.ts.
import { Moment } from "@/registry/ouro/components/ouro/moment/moment";

export const moment01 = <Moment title="No messages" heading="No messages" />;
export const moment02 = <Moment title="Nothing here" kind="info" />;
export const moment03 = <Moment title="Welcome" onClose={() => {}} />;
export const moment04 = <Moment kind="success" title="All caught up" headingLevel={2} dismissKey="caught-up" cap={{ times: 1, per: "day" }} announce />;
