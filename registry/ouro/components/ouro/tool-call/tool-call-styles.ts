export {
  detailClass,
  durationClass,
  formatDuration,
  groupListClass,
  groupTitle,
  iconClass,
  nameClass,
  rowClass,
  statusIconTone,
  statusLabels,
  statusWords,
  toolCallStatuses,
  titleRowClass,
  toolCallStatusFix,
};
export type { ToolCallStatus };

// Class strings, words and dev-message helpers for ToolCall and ToolCallGroup, apart from the components so their
// files export only components (React Fast Refresh). Class strings are literal so the app's Tailwind finds them when it
// compiles.

/**
 * Where a tool call stands: still running, done, failed, or waiting for the person (for their permission, say).
 */
type ToolCallStatus = "running" | "done" | "failed" | "waiting";

/** @internal */
const toolCallStatuses: readonly ToolCallStatus[] = ["running", "done", "failed", "waiting"];

/**
 * The `Fix:` for a status that is not one of ToolCall's, with AI Elements' tool states mapped to Ouro's.
 *
 * @internal
 */
function toolCallStatusFix(status: string): string {
  const mapped: Record<string, ToolCallStatus> = {
    "input-streaming": "running",
    "input-available": "running",
    "output-available": "done",
    "output-error": "failed",
    "approval-requested": "waiting",
    pending: "running",
    success: "done",
    error: "failed",
  };
  return `<ToolCall status="${Object.hasOwn(mapped, status) ? mapped[status] : "done"}">`;
}

/**
 * What a screen reader hears after the row, for each status.
 *
 * @internal
 * @claim "What a screen reader hears after the row" registry/ouro/components/ouro/tool-call/tool-call.test.tsx verify:testExists(registry/ouro/components/ouro/tool-call/tool-call.test.tsx::ToolCall > says each status in words for a screen reader, and shows Failed and Waiting for you)
 */
const statusLabels: Readonly<Record<ToolCallStatus, string>> = {
  running: "running",
  done: "done",
  failed: "failed",
  waiting: "waiting for you",
};

/**
 * The status words a row shows, for the statuses a person must not miss.
 *
 * @internal
 */
const statusWords: Readonly<Partial<Record<ToolCallStatus, string>>> = {
  failed: "Failed",
  waiting: "Waiting for you",
};

/**
 * The status icon's colour: success for done, destructive for failed, warning for waiting.
 *
 * @internal
 */
const statusIconTone: Readonly<Record<ToolCallStatus, string>> = {
  running: "text-muted-foreground",
  done: "text-success",
  failed: "text-destructive",
  waiting: "text-warning",
};

/**
 * A row: 44px tall on a coarse pointer and 36px from `sm` with a fine one, as Collapsible's title is, so rows with and
 * without output line up.
 *
 * @internal
 * @claim "A row: 44px tall on a coarse pointer" registry/ouro/components/ouro/tool-call/tool-call.test.tsx verify:testExists(registry/ouro/components/ouro/tool-call/tool-call.test.tsx::ToolCall > lines up a row with output and one without, as tall as a Collapsible's title) verify:testExists(registry/ouro/components/ouro/tool-call/tool-call.touch.test.tsx::ToolCall on a touch screen > makes a row with output and one without 44px tall)
 */
const rowClass =
  "box-border flex min-w-0 max-w-full items-center gap-2 min-h-ouro-11 sm:pointer-fine:min-h-9 py-2 " +
  "text-base font-normal text-foreground sm:pointer-fine:text-sm";

/**
 * The row inside a Collapsible's title, which already gives it the row's height, padding and text size.
 *
 * @internal
 */
const titleRowClass = "flex min-w-0 max-w-full items-center gap-2 font-normal text-foreground";

/** @internal */
const iconClass = "size-ouro-4 shrink-0";

/** @internal */
const nameClass = "shrink-0 font-medium text-foreground";

/**
 * The arguments' summary, in the code font, cut short with an ellipsis on one line.
 *
 * @internal
 */
const detailClass = "min-w-0 truncate font-mono text-[0.9em] text-muted-foreground";

/** @internal */
const durationClass = "shrink-0 tabular-nums text-muted-foreground";

/**
 * The calls in an open group, behind a line at their start edge.
 *
 * @internal
 */
const groupListClass = "m-0 box-border grid min-w-0 list-none border-0 border-s-2 border-solid border-border p-0 ps-3";

/**
 * How long a call took, short: "0.4s", "12s", "2m 5s".
 *
 * @internal
 * @claim "How long a call took, short" registry/ouro/components/ouro/tool-call/tool-call.test.tsx verify:testExists(registry/ouro/components/ouro/tool-call/tool-call.test.tsx::ToolCall > shows how long it took, short, and nothing for a duration it cannot read)
 */
function formatDuration(seconds: number | undefined): string | undefined {
  // Stryker disable next-line ConditionalExpression: Number.isFinite also turns undefined away, so the first test only narrows the type.
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return undefined;
  // Stryker disable next-line EqualityOperator: at 9.95 both branches write "10s".
  if (seconds < 9.95) return `${(Math.round(seconds * 10) / 10).toString()}s`;
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  const rest = whole % 60;
  return rest === 0 ? `${Math.floor(whole / 60)}m` : `${Math.floor(whole / 60)}m ${rest}s`;
}

/**
 * A group's title from its calls: "Running 3 tools", "Waiting for you", or "Ran 3 tools" with how many failed.
 *
 * @internal
 * @claim "A group's title from its calls" registry/ouro/components/ouro/tool-call/tool-call-group.test.tsx verify:testExists(registry/ouro/components/ouro/tool-call/tool-call-group.test.tsx::ToolCallGroup > titles itself from its calls: running, waiting, ran, and how many failed)
 */
function groupTitle(statuses: readonly ToolCallStatus[]): { busy: ToolCallStatus | undefined; words: string; failed: number } {
  const count = statuses.length;
  const tools = `${count} ${count === 1 ? "tool" : "tools"}`;
  const failed = statuses.filter((status) => status === "failed").length;
  if (statuses.includes("waiting")) return { busy: "waiting", words: `Waiting for you · ${tools}`, failed };
  if (statuses.includes("running")) return { busy: "running", words: `Running ${tools}`, failed };
  return { busy: undefined, words: `Ran ${tools}`, failed };
}
