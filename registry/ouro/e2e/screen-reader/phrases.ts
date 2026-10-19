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

/** "unchecked" (VoiceOver) or "not checked" (NVDA). */
export const UNCHECKED = /\b(unchecked|not checked)\b/i;

/** "checked", and neither "unchecked" nor "not checked". */
export const CHECKED = (sentence: string): boolean => /\bchecked\b/i.test(sentence) && !UNCHECKED.test(sentence);

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

/**
 * What VoiceOver said after an action, from the watcher's records of its last phrase: every
 * phrase it moved to after the first record, the one it was on as the action began, which never
 * counts. VoiceOver keeps only its last phrase, so a short phrase ("Edit dialog pop up button")
 * between two hints lasts only until the next hint: the watcher reads it every 50 ms, where
 * Guidepup's capture waits as long as the last phrase takes to say before reading again.
 */
export function spokenAfter(records: readonly string[]): string[] {
  const phrases: string[] = [];
  let previous = clean(records[0] ?? "");
  for (const record of records.slice(1)) {
    const phrase = clean(record);
    if (!phrase || phrase === previous) continue;
    phrases.push(phrase);
    previous = phrase;
  }
  return phrases;
}
