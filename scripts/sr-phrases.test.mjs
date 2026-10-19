import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CHECKBOX, CHECKED, firstMatch, inOneSentence, MARK, nameAndRole, readRecords, readsBrowser, quietFor, readyForAction, saysValue, speechVerdict, spokenAfter, UNCHECKED, WATCH_LIMIT_SECONDS, withoutHints } from "../registry/ouro/e2e/screen-reader/phrases.ts";

// The screen-reader specs' matchers (registry/ouro/e2e/screen-reader/phrases.ts), against phrases
// VoiceOver and NVDA said in the lane's runs. A matcher takes one phrase at a time, without
// VoiceOver's usage hints, and needs a control's name and role in one sentence.

// Run 39207592436, VoiceOver, after Escape closed the dialog: hints from the dialog's text field and
// from a button, then the text field again. It passed the old matcher, which joined every phrase.
const recordedFalsePass = "You are currently on a text field, inside of a web dialog. To enter text in this field, type. To exit this group, press Control-Option-Shift-Up Arrow.. You are currently on a button. To display a list of options, press Control-Option-Space. Shakshuka Name edit text";
const editTrigger = (phrase) => inOneSentence(phrase, nameAndRole("Edit", "button", "text|recipe"));

test("the Edit trigger's name and role must be in one spoken sentence, not in hints or a text field", () => {
  assert.equal(editTrigger(recordedFalsePass), false);
  for (const phrase of recordedFalsePass.split(/(?<=\.) /)) assert.equal(editTrigger(phrase), false, phrase);
  assert.equal(firstMatch(["You are currently on a button. To display a list of options, press Control-Option-Space.", "Shakshuka Name edit text"], editTrigger), undefined);
  // NVDA as focus returned, VoiceOver as it arrived, and NVDA's role-first form.
  assert.equal(editTrigger("blank. clickable, Edit, button, collapsed, opens dialog"), true);
  assert.equal(editTrigger("Edit dialog pop up button. You are currently on a button. To display a list of options, press Control-Option-Space."), true);
  assert.equal(editTrigger("button, collapsed, opens dialog, Edit"), true);
  // The dialog's own title is not the trigger.
  assert.equal(editTrigger("Edit recipe web dialog with 4 items Shakshuka"), false);
});

test("VoiceOver's speech is every phrase it moved to after the action began, so a short phrase between hints is not lost", () => {
  // Run 39234254614 attempt 1, after Escape: Guidepup's capture saw the text field's hint, slept
  // for its length (about 4 s at 7.5 words a second) and then saw only the button's hint.
  const guidepupSaw = ["You are currently on a text field, inside of a web dialog. To enter text in this field, type. To exit this group, press Control-Option-Shift-Up Arrow.", "You are currently on a button. To display a list of options, press Control-Option-Space."];
  assert.equal(firstMatch(guidepupSaw, editTrigger), undefined);
  // The watcher logs each change of VoiceOver's last phrase, after making VoiceOver say MARK.
  const records = ["Edit recipe web dialog with 4 items Shakshuka", MARK, ...guidepupSaw.slice(0, 1), "Edit dialog pop up button", guidepupSaw[1]];
  assert.deepEqual(spokenAfter(records), records.slice(2));
  assert.equal(firstMatch(spokenAfter(records), editTrigger), "Edit dialog pop up button");
  // This branch's first lane run: VoiceOver was already on the Edit button and said it again as
  // focus arrived, the same text, so its last phrase never changed and only the hint was new.
  // After MARK, saying it again is a change.
  assert.deepEqual(spokenAfter(["Edit dialog pop up button", "You are currently on a button. To display a list of options, press Control-Option-Space."]), []);
  assert.equal(firstMatch(spokenAfter(["Edit dialog pop up button", MARK, "Edit dialog pop up button", "You are currently on a button."]), editTrigger), "Edit dialog pop up button");
  // Nothing before MARK counts, nor anything at all until MARK was read.
  assert.deepEqual(spokenAfter(["Edit dialog pop up button"]), []);
  assert.deepEqual(spokenAfter([MARK, "a", "  missing value ", "b @VOModifier()-Space", "b Control-Option-Space", "a"]), ["a", "b Control-Option-Space", "a"]);
});

test("the watcher's records are read whole, across chunks and lines, and an unfinished one waits", () => {
  const first = readRecords("[[sr]]Edit recipe web dialog[[/sr]]\n[[sr]]Shakshuka\nName edit text[[/sr]]\n[[sr]]Edit dia");
  assert.deepEqual(first.records, ["Edit recipe web dialog", "Shakshuka\nName edit text"]);
  assert.equal(first.rest, "[[sr]]Edit dia");
  const second = readRecords(`${first.rest}log pop up button[[/sr]]\n`);
  assert.deepEqual(second.records, ["Edit dialog pop up button"]);
  assert.equal(second.rest, "");
  // osascript's own errors are not records.
  assert.deepEqual(readRecords("execution error: Not authorized to send Apple events to VoiceOver. (-1743)\n").records, []);
});

test("VoiceOver's usage hints are dropped before matching", () => {
  assert.equal(withoutHints("Save recipe button. You are currently on a button, inside of web content. To click this button, press Control-Option-Space. To exit this web area, press Control-Option-Shift-Up Arrow."), "Save recipe button.");
  assert.equal(withoutHints("You are currently on a selectable (null), inside of a list box."), "");
  assert.equal(withoutHints(", Choose a cou Course list box pop up collapsed combo box. You are currently on a combo box, inside of web content. Type text or, to display a list of choices, press Control-Option-Space."), ", Choose a cou Course list box pop up collapsed combo box.");
});

test("the checkbox's name, role and state come from one sentence", () => {
  const unchecked = (phrase) => inOneSentence(phrase, /\bemail me new recipes\b/i, CHECKBOX, UNCHECKED);
  assert.equal(unchecked("Email me new recipes unchecked checkbox. You are currently on a checkbox, inside of web content. To select or deselect this checkbox, press Control-Option-Space."), true);
  assert.equal(unchecked("Email me new recipes, check box, not checked"), true);
  assert.equal(unchecked("Email me new recipes. You are currently on a checkbox, inside of web content."), false);
  const checked = (phrase) => inOneSentence(phrase, CHECKED);
  assert.equal(checked("checked Email me new recipes checkbox"), true);
  assert.equal(checked("checked"), true);
  assert.equal(checked("Email me new recipes unchecked checkbox"), false);
  assert.equal(checked("Email me new recipes, check box, not checked"), false);
});

test("the dialog's title and role, the select's label, role and state, the options and the toast come from one sentence", () => {
  const opened = (phrase) => inOneSentence(phrase, /\bedit recipe\b/i, /\bdialog\b/i);
  assert.equal(opened("Edit recipe web dialog with 4 items Shakshuka"), true);
  assert.equal(opened("Edit recipe, dialog. Edit recipe, dialog. Name, edit, Shakshuka"), true);
  assert.equal(opened("Edit dialog pop up button"), false);
  const course = (phrase) => inOneSentence(phrase, /\bcourse\b/i, /\bcombo ?box\b/i, /\bcollapsed\b/i);
  assert.equal(course(", Choose a cou Course list box pop up collapsed combo box. You are currently on a combo box, inside of web content."), true);
  assert.equal(course("Course, combo box, Choose a course, collapsed, opens list"), true);
  assert.equal(course("Course. You are currently on a combo box, inside of web content."), false);
  const main = (phrase) => inOneSentence(phrase, /\bmain\b/i);
  assert.equal(main("Main (2 of 4) completion selected. You are currently on a selectable (null), inside of a list box."), true);
  assert.equal(main("Main, not selected, 2 of 4"), true);
  const save = (phrase) => inOneSentence(phrase, nameAndRole("Save recipe", "button"));
  assert.equal(save("Save recipe button. You are currently on a button, inside of web content."), true);
  assert.equal(save("Save recipe, button"), true);
  assert.equal(save("Save recipe. You are currently on a button."), false);
  assert.equal(inOneSentence("Recipe saved Find it in your cookbook.. Notifications", /\brecipe saved\b/i), true);
});

test("a combo box's value is said whole, or on VoiceOver clipped by its last three characters (ourostack/ouro-ui#113)", () => {
  const chosen = (phrase, voiceOver) => inOneSentence(phrase, (sentence) => /\bcourse\b/i.test(sentence) && saysValue(sentence, "Side", "Course", voiceOver));
  assert.equal(chosen("Course, combo box, Side, focused, collapsed, opens list", false), true);
  assert.equal(chosen(", S Course list box pop up collapsed combo box has keyboard focus Insertion at beginning of text.", true), true);
  assert.equal(chosen(", S Course list box pop up collapsed combo box", false), false);
  assert.equal(chosen(", M Course list box pop up collapsed combo box", true), false);
});

test("every spec's matcher goes through inOneSentence, and the lane counts only speech", () => {
  const dir = join(import.meta.dirname, "../registry/ouro/e2e/screen-reader");
  const specs = readdirSync(dir).filter((file) => file.endsWith(".sr.spec.ts"));
  assert.ok(specs.length >= 5);
  for (const file of specs) {
    const source = readFileSync(join(dir, file), "utf8");
    // Every assertion on speech: heard(…) or describesFocus(…), each with an inOneSentence matcher.
    const calls = [...source.matchAll(/(?:heard|describesFocus)\(sr, ([^\n]+)/g)].map((match) => match[1]);
    assert.ok(calls.length > 0, file);
    for (const call of calls) assert.match(call, /inOneSentence\(|saysTrigger/, `${file}: ${call}`);
    assert.doesNotMatch(source, /\.test\(phrase\)/, file);
  }
  const helpers = readFileSync(join(dir, "screen-reader.ts"), "utf8");
  assert.doesNotMatch(helpers, /itemText/);
  assert.match(helpers, /firstMatch\(phrases, matches\)/);
});

test("NVDA is reading the page only when the window it reports is the page's, in the browser", () => {
  // Run 39253118106: NVDA read the Start window, and the Dialog spec hung until it timed out.
  assert.equal(readsBrowser("Start, window", "forms-dialog--playground ⋅ Storybook"), false);
  assert.equal(readsBrowser("Taskbar", ""), false);
  assert.equal(readsBrowser("forms-dialog--playground ⋅ Storybook - Google Chrome for Testing", "forms-dialog--playground ⋅ Storybook"), true);
  assert.equal(readsBrowser("Google Chrome for Testing", ""), true);
  assert.equal(readsBrowser("overlays-dialog--playground - Storybook", "overlays-dialog--playground - Storybook"), true);
});

test("a VoiceOver check decides found, wait or fail: a missing phrase is an accessibility failure, a broken watcher infrastructure", () => {
  const what = '"Edit", button';
  const hint = "You are currently on a button. To display a list of options, press Control-Option-Space.";
  const at = (now, ended = null) => speechVerdict([hint], editTrigger, what, { now, deadline: 1_000, ended });
  assert.deepEqual(speechVerdict([hint, "Edit dialog pop up button"], editTrigger, what, { now: 5_000, deadline: 1_000, ended: { code: 1, detail: "x" } }), { found: "Edit dialog pop up button", heard: `"${hint}" | "Edit dialog pop up button"` });
  assert.equal(at(500), "wait");
  const missing = `[sr] no utterance matched ${what}; heard: "${hint}"`;
  assert.deepEqual(at(1_001), { fail: missing });
  // The watcher reached its own time limit (osascript ended 0): that is no more speech, not a broken
  // runner, so the check waits out its deadline and a missing phrase stays an accessibility failure.
  assert.equal(at(500, { code: 0, detail: "osascript ended (exit 0)" }), "wait");
  assert.deepEqual(at(1_001, { code: 0, detail: "osascript ended (exit 0)" }), { fail: missing });
  // The deadline is checked first: past it, even a watcher that failed decides nothing.
  assert.deepEqual(at(1_001, { code: 1, detail: "osascript ended (exit 1): execution error (-1743)" }), { fail: missing });
  // Before it, a watcher that failed (or never ran) is the runner's.
  assert.deepEqual(at(500, { code: 1, detail: "osascript ended (exit 1): execution error (-1743)" }), { fail: `[sr] infrastructure: VoiceOver's speech stopped being read (osascript ended (exit 1): execution error (-1743)); heard: "${hint}"` });
  assert.deepEqual(at(500, { code: null, detail: "osascript did not run: ENOENT" }).fail.startsWith("[sr] infrastructure:"), true);
  assert.deepEqual(speechVerdict([], editTrigger, what, { now: 1_001, deadline: 1_000, ended: null }), { fail: `[sr] no utterance matched ${what}; heard: nothing` });
});

test("the VoiceOver watcher outlives every check: its own limit is longer than a whole test", async () => {
  const { default: config } = await import("../playwright.screen-reader.config.ts");
  assert.ok(WATCH_LIMIT_SECONDS * 1000 > config.timeout, `${WATCH_LIMIT_SECONDS} s against a test timeout of ${config.timeout} ms`);
  const helpers = readFileSync(join(import.meta.dirname, "../registry/ouro/e2e/screen-reader/screen-reader.ts"), "utf8");
  // The limit is that constant, not the check's timeout, and the deadline is checked in speechVerdict.
  assert.match(helpers, /\(current date\) \+ \$\{WATCH_LIMIT_SECONDS\}/);
  assert.doesNotMatch(helpers, /timeout \/ 1000/);
  assert.match(helpers, /speechVerdict\(/);
  // An orphaned watcher must not start VoiceOver again by asking it for its last phrase.
  assert.match(helpers, /if application "VoiceOver" is running then/);
});

test("before an action VoiceOver must have been quiet: no new phrase for the whole window", () => {
  // Runs 39262324426 and 39263264203: Enter came while VoiceOver was still speaking, and it never
  // said the dialog's name; the check now waits for quiet first, as a person listens before a key.
  assert.equal(quietFor([1_000, 2_500], 4_400, 2_000), false);
  assert.equal(quietFor([1_000, 2_500], 4_500, 2_000), true);
  assert.equal(quietFor([], 0, 2_000), false);
  // Counting from the last phrase that was read, whenever that was.
  assert.equal(quietFor([10], 2_010, 2_000), true);
});

test("only phrases after the last MARK count, so an old MARK cannot let earlier speech in", () => {
  const records = [MARK, "Edit dialog pop up button", MARK, "Edit recipe web dialog with 4 items Shakshuka"];
  assert.deepEqual(spokenAfter(records), ["Edit recipe web dialog with 4 items Shakshuka"]);
});

/**
 * A fake VoiceOver watch on a fake clock: `next` moves time to the deadline it is given, and
 * `say` (VoiceOver's `output` of MARK) appends MARK 100 ms later unless VoiceOver drops it.
 */
function fakeWatch({ dropped = 0, ended = null, first = ["Edit dialog pop up button"] } = {}) {
  let now = 0;
  const pending = [];
  const records = [];
  const stamps = [];
  const deliver = () => {
    while (pending.length > 0 && pending[0][0] <= now) {
      records.push(pending.shift()[1]);
      stamps.push(now);
    }
  };
  for (const phrase of first) pending.push([0, phrase]);
  let says = 0;
  return {
    state: {
      records,
      stamps,
      now: () => now,
      ended: () => ended,
      next: async (deadline) => {
        now = Math.max(now, Math.min(deadline, pending[0]?.[0] ?? deadline));
        deliver();
      },
    },
    say: async () => {
      says += 1;
      if (says > dropped) pending.push([now + 100, MARK]);
    },
    says: () => says,
  };
}

test("VoiceOver is ready for the action once it is quiet and MARK is its last phrase; a MARK it drops is said again", async () => {
  const ready = fakeWatch();
  assert.equal(await readyForAction(ready.state, ready.say), null);
  assert.equal(ready.says(), 1);
  assert.equal(ready.state.records.at(-1), MARK);
  // Run 39269919232: VoiceOver never said MARK once; the watch says it again rather than failing.
  const once = fakeWatch({ dropped: 1 });
  assert.equal(await readyForAction(once.state, once.say), null);
  assert.equal(once.says(), 2);
});

test("a watch that cannot get VoiceOver ready says why, and not that it was stopped", async () => {
  const never = fakeWatch({ dropped: 3 });
  assert.equal(await readyForAction(never.state, never.say), `"${MARK}" was never VoiceOver's last phrase in 3 tries`);
  const silent = fakeWatch({ first: [] });
  assert.equal(await readyForAction(silent.state, silent.say), "VoiceOver said nothing within 10 s");
  const broken = fakeWatch({ ended: { code: 1, detail: "osascript ended (exit 1): execution error (-1743)" } });
  assert.equal(await readyForAction(broken.state, broken.say), "osascript ended (exit 1): execution error (-1743)");
  const refused = fakeWatch();
  assert.equal(await readyForAction(refused.state, async () => { throw new Error("Not authorized"); }), `VoiceOver did not say "${MARK}": Not authorized`);
});
