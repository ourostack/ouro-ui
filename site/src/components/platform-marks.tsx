import type { JSX } from "react";
import { cn } from "@/registry/ouro/lib/ouro/cn";

/*
 * The four platforms' marks, drawn in currentColor at one size on one baseline. Apple's, Windows' and Android's paths
 * are Simple Icons' (CC0-1.0, simple-icons 16.38.1); the globe is drawn here. The marks themselves stay their owners'
 * trademarks: the footer carries the Android robot's credit.
 */
const PATHS: Record<string, string> = {
  apple:
    "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701",
  windows: "M0,0H11.377V11.372H0ZM12.623,0H24V11.372H12.623ZM0,12.623H11.377V24H0Zm12.623,0H24V24H12.623",
  android:
    "M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0683-.7438-1.9118-1.8435-3.2928-2.7402-4.1836a12.1048 12.1048 0 0 0-2.1309-1.6875c.6594-1.122 1.312-2.2559 1.9649-3.3848.2077-.3615.1886-.7956-.0079-1.1191a1.1001 1.1001 0 0 0-.8515-.5332c-.5225-.0536-.9392.3128-1.0488.5449zm-.0391 8.461c.3944.5926.324 1.3306-.1563 1.6503-.4799.3197-1.188.0985-1.582-.4941-.3944-.5927-.324-1.3307.1563-1.6504.4727-.315 1.1812-.1086 1.582.4941zM7.207 13.5273c.4803.3197.5506 1.0577.1563 1.6504-.394.5926-1.1038.8138-1.584.4941-.48-.3197-.5503-1.0577-.1563-1.6504.4008-.6021 1.1087-.8106 1.584-.4941z",
};

// Each mark's box, so the four read at one weight and stand on one line: the Windows squares drawn smaller, the globe
// larger, the Android head lowered to the line the others stand on.
const BOXES: Record<string, string> = { web: "1 1 22 22", windows: "-2 -4 28 28", android: "0 -5 24 24" };

/** A platform's mark: 1em square, sitting on the text's baseline like a letter. */
export function PlatformMark({ id, className }: { id: string; className?: string }): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox={BOXES[id] ?? "0 0 24 24"} className={cn("inline-block size-[1em] shrink-0 self-baseline translate-y-[0.12em]", className)} fill="currentColor">
      {id === "web" ? (
        <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <circle cx="12" cy="12" r="10.05" />
          <path d="M1.95 12h20.1M12 1.95c2.7 2.75 4.05 6.1 4.05 10.05S14.7 19.3 12 22.05M12 1.95C9.3 4.7 7.95 8.05 7.95 12S9.3 19.3 12 22.05" />
        </g>
      ) : (
        <path d={PATHS[id]} />
      )}
    </svg>
  );
}
