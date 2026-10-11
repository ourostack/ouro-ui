// Bundled by scripts/dev-strip.test.mjs to prove dev messages are stripped.
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/class-name-check";
import { devThrow, devWarn } from "@/registry/ouro/lib/dev";

export function warnProbe(): void {
  if (process.env.NODE_ENV !== "production") {
    devWarn("Button", "PROBE_PROBLEM_TEXT", "PROBE_FIX_TEXT");
  }
}

export function throwProbe(): never {
  return devThrow(
    "Sheet.Title",
    "PROBE_THROW_PROBLEM",
    process.env.NODE_ENV !== "production" ? "PROBE_THROW_FIX" : "",
  );
}

export function Probe() {
  useAppearanceClassNameCheck("Button", "bg-red-500", "PROBE_HINT");
  return null;
}
