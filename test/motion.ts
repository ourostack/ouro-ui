import matrix from "./generated/motion-matrix.json";

export { MOTION_KINDS, STATE_ATTRIBUTES } from "../scripts/motion-states.mts";
export {
  expectGestureSettle,
  expectMotion,
  expectNoMotion,
  expectTransition,
  parseDuration,
  takeMotionRecords,
  type ExpectMotionOptions,
  type ExpectNoMotionOptions,
  type MotionRecord,
} from "@/registry/ouro/lib/ouro/testing/motion";

// The repository's side of the motion contract. The helpers ship in the test kit
// (registry/ouro/lib/ouro/testing/motion.ts), because the component tests that call them ship
// to apps; this module adds the closed list of state attributes and the declared maps, as
// test/generated/motion-matrix.json (`pnpm controls:matrix`), so a browser test reads them
// without the manifests. scripts/motion-reporter.mts collects the records and
// `pnpm motion:coverage` holds each map to them.

/** One state of a stem's component.json `motion`, for one animated part (`null` for a `none` state). */
export interface MotionRow {
  item: string;
  stem: string;
  state: string;
  kind: "motion" | "gesture-settle" | "none";
  part: string | null;
  properties: string[];
  reduced: string[];
  tests: string[];
}

/** Every declared state and animated part, from test/generated/motion-matrix.json. */
export const motionRows = matrix as MotionRow[];
