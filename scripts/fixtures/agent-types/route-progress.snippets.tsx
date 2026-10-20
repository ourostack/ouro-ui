// What agents write with route-progress: snippets whose cases are in route-progress.cases.ts.
import { RouteProgress } from "@/registry/ouro/components/ouro/route-progress/route-progress";

const navigation = { state: "loading" } as { state: "idle" | "loading" | "submitting" };

export const routeProgress01 = <RouteProgress active loading={navigation.state !== "idle"} />;
export const routeProgress02 = <RouteProgress active value={40} />;
export const routeProgressOk01 = <RouteProgress active={navigation.state !== "idle"} label="Opening the recipe" />;
