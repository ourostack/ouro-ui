// What agents write with timer: snippets whose cases are in timer.cases.ts.
import { Timer } from "@/registry/ouro/components/ouro/timer/timer";

export const timer01 = <Timer label="Pasta" duration={600} minutes={10} />;
export const timer02 = <Timer label="Pasta" duration={600} onComplete={() => {}} />;
export const timerOk01 = <Timer label="Pasta" duration={600} id="pasta" silent size="lg" labels={{ done: "Ready" }} onDone={() => {}} className="mt-6" />;
