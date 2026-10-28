export type SentenceTest = RegExp | ((sentence: string) => boolean);

// What the screen-reader specs accept as spoken, kept apart from Guidepup so the script tests can
// check it against recorded phrases (scripts/sr-phrases.test.mjs). A matcher reads one phrase at a
// time, never phrases joined together, after dropping VoiceOver's usage hints, and needs everything
// it asks for in one sentence: a control's name and its role must be said together. A
// `SentenceTest` is a pattern or a predicate on one sentence.

/** VoiceOver's usage hints ("You are currently on a button.", "To click this button, press …"), which name no control. */
const hint = /^(you are currently (on|in)\b|to [a-z]+\b.*\bpress\b|to enter text\b|to exit\b|type text\b|press control-option\b)/i;

/** A phrase's sentences, split after each full stop. */
const sentences = (phrase: string): string[] =>
  phrase
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

/** A phrase without VoiceOver's usage hints. */
export function withoutHints(phrase: string): string {
  return sentences(phrase)
    .filter((sentence) => !hint.test(sentence))
    .join(" ");
}

/** Whether one sentence of the phrase, hints dropped, passes every test. */
export function inOneSentence(phrase: string, ...tests: SentenceTest[]): boolean {
  return sentences(withoutHints(phrase)).some((sentence) => tests.every((check) => (check instanceof RegExp ? check.test(sentence) : check(sentence))));
}

/** The first phrase `matches` accepts on its own, or undefined: phrases are never joined. */
export function firstMatch(phrases: readonly string[], matches: (phrase: string) => boolean): string | undefined {
  return phrases.find((phrase) => matches(phrase));
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A control's name and role in either order within a sentence ("Edit dialog pop up button",
 * "Edit, button", "button, collapsed, opens dialog, Edit"). `notFollowedBy` rules out words that
 * make the name another control's ("edit text" is a text field; "Edit recipe" is the dialog).
 */
export function nameAndRole(name: string, role: string, notFollowedBy?: string): RegExp {
  const named = `\\b${escape(name)}\\b${notFollowedBy ? `(?!\\s+(?:${notFollowedBy})\\b)` : ""}`;
  return new RegExp(`${named}[^.]*\\b${role}\\b|\\b${role}\\b[^.]*${named}`, "i");
}

/** A link, as both readers say it ("link", "visited link"). */
export const LINK = /\blink\b/i;

/** `aria-current="page"`: VoiceOver and NVDA both say "current page". */
export const CURRENT_PAGE = /\bcurrent page\b/i;

/** "unchecked" (VoiceOver) or "not checked" (NVDA). */
export const UNCHECKED = /\b(unchecked|not checked)\b/i;

/** "checked", and neither "unchecked" nor "not checked". */
export const CHECKED = (sentence: string): boolean => /\bchecked\b/i.test(sentence) && !UNCHECKED.test(sentence);

/** "unselected" or "not selected". */
const UNSELECTED = /\b(unselected|not selected)\b/i;

/**
 * A checked radio button: VoiceOver says "selected" ("Dark selected radio button, 2 of 3"), NVDA
 * "checked"; neither "not" form counts.
 */
export const RADIO_CHECKED = (sentence: string): boolean => CHECKED(sentence) || (/\bselected\b/i.test(sentence) && !UNSELECTED.test(sentence));

/** The role word for a checkbox: "checkbox" (VoiceOver) or "check box" (NVDA). */
export const CHECKBOX = /\bcheck ?box\b/i;

/**
 * Whether a sentence gives a combo box's value. NVDA says it whole. VoiceOver with WebKit says a
 * combo box's value without its last three characters (", Choose a cou Course list box pop up",
 * ", S Course list box pop up" for "Side") in every run, while it reads the options whole
 * (ourostack/ouro-ui#113): that form counts too, on VoiceOver only, right before the label.
 */
export function saysValue(sentence: string, value: string, label: string, voiceOver: boolean): boolean {
  if (new RegExp(`\\b${escape(value)}\\b`, "i").test(sentence)) return true;
  return voiceOver && value.length > 3 && sentence.toLowerCase().includes(`, ${value.slice(0, -3)} ${label}`.toLowerCase());
}

/** How screen-reader.ts's VoiceOver watcher marks each phrase it logs. */
export const RECORD_START = "[[sr]]";
export const RECORD_END = "[[/sr]]";

/** The whole records in `buffer` (the watcher's output so far), and the unfinished rest. */
export function readRecords(buffer: string): { records: string[]; rest: string } {
  const records: string[] = [];
  let rest = buffer;
  for (;;) {
    const start = rest.indexOf(RECORD_START);
    const end = start === -1 ? -1 : rest.indexOf(RECORD_END, start);
    if (end === -1) return { records, rest: start === -1 ? "" : rest.slice(start) };
    records.push(rest.slice(start + RECORD_START.length, end));
    rest = rest.slice(end + RECORD_END.length);
  }
}

/** A phrase as Guidepup cleans VoiceOver's (`cleanSpokenPhrase`). */
const clean = (phrase: string): string =>
  phrase
    .trim()
    .replace(/^missing value$/, "")
    .replaceAll("@VOModifier()", "Control-Option")
    .replace(/\s\s+/g, " ");

/** What the VoiceOver watcher has VoiceOver say before an action: its last phrase, until the action makes it say something. */
export const MARK = "Speech check";

/**
 * What VoiceOver said after an action, from the watcher's records of its last phrase: every
 * phrase it moved to after the last MARK, which the watcher has it say just before the action. Nothing
 * before MARK counts, so neither does what VoiceOver was saying before the action; and a phrase it
 * says again (the control it was already on, as focus arrives) is still a change from MARK.
 * VoiceOver keeps only its last phrase, so a short phrase ("Edit dialog pop up button") between
 * two hints lasts only until the next hint: the watcher reads it every 20 ms, where Guidepup's
 * capture waits as long as the last phrase takes to say before reading again.
 */
export function spokenAfter(records: readonly string[]): string[] {
  const start = records.findLastIndex((record) => clean(record) === MARK);
  if (start === -1) return [];
  const phrases: string[] = [];
  let previous = MARK;
  for (const record of records.slice(start + 1)) {
    const phrase = clean(record);
    if (!phrase || phrase === previous) continue;
    phrases.push(phrase);
    previous = phrase;
  }
  return phrases;
}

/** The window title Chromium's window has under Playwright, as @guidepup/playwright names it. */
const CHROMIUM = "Google Chrome For Testing";

/** A window title as NVDA says it, without the symbols it reads differently from the page. */
const titleWords = (text: string) =>
  text
    .toLowerCase()
    .replace(/[|¦:;'"`\-‐–—·_()[\]{}\\^~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Whether the window NVDA reports (`windowTitle`) is the page's (`pageTitle`), in the browser (nvda.ts). */
export function readsBrowser(windowTitle: string, pageTitle: string): boolean {
  const window = titleWords(windowTitle);
  const title = titleWords(pageTitle);
  return (title.length > 0 && window.startsWith(title)) || window.includes(titleWords(CHROMIUM));
}

/**
 * How long the VoiceOver watcher's osascript may run (screen-reader.ts): longer than a whole test,
 * so it outlives every check's deadline and only `stop()` ends it, but finite, so a watcher left
 * behind by a worker that died ends too.
 */
export const WATCH_LIMIT_SECONDS = 600;

/** How the VoiceOver watcher's osascript ended: its exit code (null when it never ran), and why. */
export interface WatchEnd {
  code: number | null;
  detail: string;
}

/**
 * What a VoiceOver check (screen-reader.ts, `heard`) does next with the phrases read so far: a
 * phrase `matches` accepts is found, even late; past `deadline` a missing phrase fails as an
 * accessibility finding, whatever became of the watcher; before it, a watcher that failed (exited
 * non-zero, or never ran) fails as infrastructure, and otherwise the check waits for more speech.
 * A watcher that ended cleanly has only stopped reading, so the check waits out its deadline.
 */
export function speechVerdict(phrases: readonly string[], matches: (phrase: string) => boolean, what: string, { now, deadline, ended }: { now: number; deadline: number; ended: WatchEnd | null }): { found: string; heard: string } | { fail: string } | "wait" {
  const heard = phrases.map((phrase) => `"${phrase}"`).join(" | ") || "nothing";
  const found = firstMatch(phrases, matches);
  if (found !== undefined) return { found, heard };
  if (now > deadline) return { fail: `[sr] no utterance matched ${what}; heard: ${heard}` };
  if (ended !== null && ended.code !== 0) return { fail: `[sr] infrastructure: VoiceOver's speech stopped being read (${ended.detail}); heard: ${heard}` };
  return "wait";
}

/**
 * Whether VoiceOver has been quiet for `quietMs` at `now`: the watcher read its last new phrase at
 * the last of `stamps` (milliseconds), and nothing since. A check acts only once VoiceOver is quiet,
 * as a person listens before pressing the next key: Enter pressed while VoiceOver was still
 * speaking opened the dialog without VoiceOver ever saying its name.
 */
export function quietFor(stamps: readonly number[], now: number, quietMs: number): boolean {
  const last = stamps.at(-1);
  return last !== undefined && now - last >= quietMs;
}

/** What `readyForAction` reads of a VoiceOver watch (screen-reader.ts), so a fake can stand in. */
export interface WatchState {
  /** VoiceOver's last phrase each time it changed, and when the watch read it (`now()` time). */
  readonly records: readonly string[];
  readonly stamps: readonly number[];
  now(): number;
  ended(): WatchEnd | null;
  /** Resolves when a phrase is read, the watch ends, or `deadline` passes. */
  next(deadline: number): Promise<void>;
}

/**
 * Gets VoiceOver ready for an action, returning null once it is, or why it could not be. It waits
 * for VoiceOver to say something (10 s), then for quiet (2 s, at most 10 s of waiting), has it say
 * MARK (`say`), waits up to 3 s for MARK to be its last phrase and then for a quiet second with MARK
 * still last. VoiceOver dropped MARK once (run 39269919232), and can talk over it, so each of those
 * tries again, three times in all.
 */
export async function readyForAction(watch: WatchState, say: () => Promise<void>): Promise<string | null> {
  const until = async (done: () => boolean, ms: number) => {
    const limit = watch.now() + ms;
    while (!done() && watch.ended() === null && watch.now() < limit) await watch.next(Math.min(limit, watch.now() + 250));
    return done();
  };
  const lastIsMark = () => clean(watch.records.at(-1) ?? "") === MARK;
  if (!(await until(() => watch.records.length > 0, 10_000))) return watch.ended()?.detail ?? "VoiceOver said nothing within 10 s";
  for (let attempt = 0; attempt < 3; attempt++) {
    await until(() => quietFor(watch.stamps, watch.now(), 2_000), 10_000);
    try {
      await say();
    } catch (error) {
      return `VoiceOver did not say "${MARK}": ${error instanceof Error ? error.message : String(error)}`;
    }
    const marked = await until(lastIsMark, 3_000);
    if (marked) await until(() => !lastIsMark() || quietFor(watch.stamps, watch.now(), 1_000), 5_000);
    const ended = watch.ended();
    if (ended !== null) return ended.detail;
    if (marked && lastIsMark()) return null;
  }
  return `"${MARK}" was never VoiceOver's last phrase in 3 tries`;
}

/**
 * Whether a check's error says the expected phrase never came (`[sr] no utterance matched`), the
 * only failure after which the Checkbox and Checklist steps may ask VoiceOver to describe the focus
 * (screen-reader.ts, `heardOrDescribed`; ourostack/ouro-ui#118). The runner's failures and any
 * other error stay what they are.
 */
export function missedPhrase(message: string): boolean {
  return /^\[sr\] no utterance matched /.test(message);
}
