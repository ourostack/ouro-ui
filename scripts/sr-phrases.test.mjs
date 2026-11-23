import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CHECKBOX, CHECKED, CURRENT_PAGE, describeReadyFailure, firstMatch, HINT_ONLY_PREFIX, hintOnlyMiss, LINK, RADIO_CHECKED, inOneSentence, MARK, missedPhrase, nameAndRole, readRecords, readsBrowser, quietFor, readyForAction, saidInMiss, saysValue, speechTimeline, speechVerdict, spokenAfter, UNCHECKED, WATCH_LIMIT_SECONDS, withoutHints, withTimeline } from "../registry/ouro/e2e/screen-reader/phrases.ts";

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

test("a link to the current page is said with its name, the role and \"current page\" in one sentence; another link without it", () => {
  const current = (phrase) => inOneSentence(phrase, /\brecipes\b/i, LINK, CURRENT_PAGE);
  assert.equal(current("current page, link, Recipes"), true);
  assert.equal(current("Recipes, current page, link. You are currently on a link, inside of web content."), true);
  assert.equal(current("Recipes, link"), false);
  assert.equal(current("Recipes. current page link"), false);
  const other = (phrase) => inOneSentence(phrase, /\bcookbooks\b/i, LINK, (sentence) => !CURRENT_PAGE.test(sentence));
  assert.equal(other("link, Cookbooks"), true);
  assert.equal(other("visited link Cookbooks"), true);
  assert.equal(other("current page, link, Cookbooks"), false);
});

test("a checked radio button is \"selected\" on VoiceOver and \"checked\" on NVDA, and neither is said of one that is not", () => {
  const dark = (phrase) => inOneSentence(phrase, /\bdark\b/i, RADIO_CHECKED);
  // VoiceOver, as heard on the release rehearsal (ColorSchemeToggle).
  assert.equal(dark('"Dark selected radio button, 2 of 3" | "You are currently on a selected radio button, 2 of 3."'), true);
  // NVDA.
  assert.equal(dark("Dark  radio button  checked  2 of 3"), true);
  assert.equal(dark("Dark  radio button  not checked  2 of 3"), false);
  assert.equal(dark("Dark radio button, unselected, 2 of 3"), false);
  assert.equal(dark("Dark radio button, not selected, 2 of 3"), false);
  assert.equal(dark("Dark radio button, 2 of 3"), false);
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

test("a combo box's value counts only whole, not clipped as VoiceOver read a button combobox's (ourostack/ouro-ui#113)", () => {
  const chosen = (phrase) => inOneSentence(phrase, (sentence) => /\bcourse\b/i.test(sentence) && saysValue(sentence, "Side"));
  assert.equal(chosen("Course, combo box, Side, focused, collapsed, opens list"), true);
  assert.equal(chosen("Side Course list box pop up collapsed combo box has keyboard focus Insertion at beginning of text."), true);
  assert.equal(chosen(", S Course list box pop up collapsed combo box has keyboard focus Insertion at beginning of text."), false);
});

test("every spec's matcher goes through inOneSentence, and the lane counts only speech", () => {
  const dir = join(import.meta.dirname, "../registry/ouro/e2e/screen-reader");
  const specs = readdirSync(dir).filter((file) => file.endsWith(".sr.spec.ts"));
  assert.ok(specs.length >= 5);
  for (const file of specs) {
    const source = readFileSync(join(dir, file), "utf8");
    // Every assertion on speech: heard(…) or describesFocus(…), each with an inOneSentence matcher.
    const calls = [...source.matchAll(/(?:heard|heardOrDescribed|describesFocus)\(sr, ([^\n]+)/g)].map((match) => match[1]);
    assert.ok(calls.length > 0, file);
    for (const call of calls) assert.match(call, /inOneSentence\(|saysTrigger/, `${file}: ${call}`);
    assert.doesNotMatch(source, /\.test\(phrase\)/, file);
  }
  const helpers = readFileSync(join(dir, "screen-reader.ts"), "utf8");
  assert.doesNotMatch(helpers, /itemText/);
  assert.match(helpers, /firstMatch\(phrases, matches\)/);
});

test("the specs wait for speech, never for a fixed time", () => {
  const dir = join(import.meta.dirname, "../registry/ouro/e2e/screen-reader");
  const specs = readdirSync(dir).filter((file) => file.endsWith(".sr.spec.ts"));
  assert.ok(specs.length >= 5);
  for (const file of specs) assert.doesNotMatch(readFileSync(join(dir, file), "utf8"), /waitForTimeout|setTimeout|\bsleep\(/, file);
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

// ourostack/ouro-ui#3156: the dashboard pattern's "Speech check" went unread with only "read: main" in
// the log, so the next sighting needs the VO cursor each try read and the page's own accessibility
// tree at the point it gave up, both folded into the one message screen-reader.ts throws.
test("an infrastructure failure's message carries the VO cursor each try read and the page's accessibility tree", () => {
  const message = describeReadyFailure({
    why: `"${MARK}" was never VoiceOver's last phrase in 3 tries`,
    read: '"main"',
    cursorTries: ['main, landmark', 'main, landmark', 'main, landmark'],
    axTree: "- banner\n- main",
  });
  assert.match(message, /^\[sr\] infrastructure: VoiceOver's speech could not be read: "Speech check" was never VoiceOver's last phrase in 3 tries; read: "main"/);
  assert.match(message, /VO cursor before each try: try 1: "main, landmark" \| try 2: "main, landmark" \| try 3: "main, landmark"/);
  assert.match(message, /accessibility tree: - banner\n- main/);
  // No tries read (VoiceOver said nothing at all) and no tree (the page fixture never gave one): both say so plainly.
  const bare = describeReadyFailure({ why: "VoiceOver said nothing within 10 s", read: "nothing", cursorTries: [], axTree: null });
  assert.match(bare, /VO cursor before each try: not read/);
  assert.match(bare, /accessibility tree: not captured/);
});

test("only a phrase that never came lets the Checkbox and Checklist steps ask VoiceOver to describe the focus (#118)", () => {
  // Runs 39273820587 and 39278342203: after Space, VoiceOver said only the checkbox's hint.
  assert.equal(missedPhrase('[sr] no utterance matched unchecked, after Space; heard: "You are currently on a checkbox. To select or deselect this checkbox, press Control-Option-Space."'), true);
  // The runner's failures, and any other error, stay what they are.
  assert.equal(missedPhrase("[sr] infrastructure: VoiceOver's speech stopped being read (osascript ended (exit 1)); heard: nothing"), false);
  assert.equal(missedPhrase("[sr] infrastructure: VoiceOver's speech could not be read: no phrase within 10 s; read: nothing"), false);
  assert.equal(missedPhrase("locator.focus: Timeout 30000ms exceeded."), false);
  assert.equal(missedPhrase("Error: expect(locator).toBeChecked() failed"), false);
  // The description must still give the row's name, the role and the new state in one sentence.
  const described = (phrase) => inOneSentence(phrase, /\brolled oats\b/i, CHECKBOX, UNCHECKED);
  assert.equal(described("rolled oats 1 cup unchecked checkbox has keyboard focus"), true);
  assert.equal(described("rolled oats 1 cup checked checkbox has keyboard focus"), false);
  assert.equal(described("You are currently on a checkbox. rolled oats unchecked."), false);
});

test("the Checkbox step's description must give the box's name, the role and the new state in one sentence (#118)", () => {
  // Runs 40638827936 and 40638834441: a native checkbox and a plain role="checkbox" got the same silence after Space.
  const described = (phrase) => inOneSentence(phrase, /\bemail me new recipes\b/i, CHECKBOX, CHECKED);
  assert.equal(described("Email me new recipes checked checkbox has keyboard focus"), true);
  assert.equal(described("Email me new recipes unchecked checkbox has keyboard focus"), false);
  assert.equal(described("You are currently on a checkbox, inside of web content. Email me new recipes checked."), false);
});

test("a miss lists what VoiceOver said, so a wrong state it said fails instead of being described (#118)", () => {
  assert.deepEqual(saidInMiss("[sr] no utterance matched checked, after Space; heard: nothing"), []);
  const said = saidInMiss('[sr] no utterance matched checked, after Space; heard: "unchecked Email me new recipes checkbox" | "You are currently on a checkbox"');
  assert.deepEqual(said, ["unchecked Email me new recipes checkbox", "You are currently on a checkbox"]);
  assert.equal(said.some((phrase) => UNCHECKED.test(phrase)), true);
  // The hint alone, which VoiceOver says after Space on a Checklist row, contradicts neither state.
  const hint = saidInMiss('[sr] no utterance matched unchecked, after Space; heard: "You are currently on a checkbox. To select or deselect this checkbox, press Control-Option-Space."');
  assert.equal(hint.some((phrase) => inOneSentence(phrase, CHECKED) || UNCHECKED.test(phrase)), false);
});

test("the describe fallback is the Checkbox and Checklist toggles' (#118) and the Dialog opening's (#119) alone, once each", () => {
  const dir = join(import.meta.dirname, "../registry/ouro/e2e/screen-reader");
  const uses = Object.fromEntries(
    readdirSync(dir)
      .filter((file) => file.endsWith(".sr.spec.ts"))
      .map((file) => [file, (readFileSync(join(dir, file), "utf8").match(/heardOrDescribed\(/g) ?? []).length])
      .filter(([, count]) => count > 0),
  );
  assert.deepEqual(uses, { "checkbox.sr.spec.ts": 1, "checklist.sr.spec.ts": 1, "dialog.sr.spec.ts": 1 });
  // The Menu's opening is only logged on macOS 15's VoiceOver, and must be read everywhere else (#1721).
  const menuSpec = readFileSync(join(dir, "menu.sr.spec.ts"), "utf8");
  assert.match(menuSpec, /if \(onOlderMacOS\(\)\) \{\n {4}await said\(sr, open,/);
  assert.match(menuSpec, /\} else \{\n {4}await heard\(sr, open,/);
  // A field Form focuses after a submit needs no fallback: Form's alert says the error for every reader (#1720).
  const textField = readFileSync(join(dir, "text-field.sr.spec.ts"), "utf8");
  assert.match(textField, /heard\(sr, submit, \(phrase\) => inOneSentence\(phrase, \/\\bcouldn't save\\b\/i/);
  const checkbox = readFileSync(join(dir, "checkbox.sr.spec.ts"), "utf8");
  assert.match(checkbox, /ourostack\/ouro-ui#118/);
  // #118 is VoiceOver's on macOS 15 alone (macOS 26 reads the change), so it falls back only there; #119 still misses on 26.
  assert.match(checkbox, /finding: "ourostack\/ouro-ui#118",\n[^\n]*\n {4}olderMacOS: true,/);
  assert.doesNotMatch(checkbox, /from: "container"/);
  const checklist = readFileSync(join(dir, "checklist.sr.spec.ts"), "utf8");
  const dialog = readFileSync(join(dir, "dialog.sr.spec.ts"), "utf8");
  assert.match(checklist, /ourostack\/ouro-ui#118/);
  assert.match(dialog, /ourostack\/ouro-ui#119/);
  assert.match(checklist, /finding: "ourostack\/ouro-ui#118",\n[^\n]*\n {4}olderMacOS: true,/);
  assert.doesNotMatch(dialog, /olderMacOS/);
  // The Dialog's is its opening step, which describes the focus's container, not the closing one.
  assert.match(dialog, /heardOrDescribed\(sr, \(\) => page\.keyboard\.press\("Enter"\)[^\n]*from: "container"/);
  assert.doesNotMatch(checklist, /from: "container"/);
  const guide = readFileSync(join(import.meta.dirname, "../docs/guides/screen-reader-lane.md"), "utf8");
  assert.match(guide, /ourostack\/ouro-ui#118/);
  assert.match(guide, /ourostack\/ouro-ui#119/);
  assert.match(guide, /ourostack\/ouro-ui#1720/);
});

test("the opened dialog, described, must name it as a web dialog in one sentence (#119)", () => {
  const describedDialog = (phrase) => inOneSentence(phrase, /\bedit recipe\b/i, /\bweb dialog\b/i);
  assert.equal(describedDialog("Edit recipe web dialog with 4 items"), true);
  // What the focused field alone says, and the miss itself (runs 39282545974 and others), do not.
  assert.equal(describedDialog("Name edit text Shakshuka has keyboard focus Insertion at beginning of text."), false);
  assert.equal(describedDialog("Shakshuka"), false);
  assert.equal(describedDialog("You are currently on a text field, inside of a web dialog. To enter text in this field, type."), false);
  // The trigger's own name is not the dialog's.
  assert.equal(describedDialog("Edit dialog pop up button"), false);
});

test("a VoiceOver check's timeline gives MARK, each phrase after the last MARK, the action and the focus moves, in time order, on one line", () => {
  // MARK at 1010 (the last one; the earlier phrase is before it), the action from 1500 to 1900, a focus move at 1560.
  const records = ["Wrong earlier phrase", "Speech check", "Speech check", "Edit dialog pop up button", "Edit dialog pop up button", "You are currently on a button. To display a list of options, press Control-Option-Space.", "Close, button"];
  const stamps = [900, 1000, 1010, 1620, 1625, 1700, 2100];
  const timeline = speechTimeline({ records, stamps, actionStart: 1500, actionEnd: 1900, focusMoves: [{ at: 1560, tag: "button", name: "Edit" }] });
  assert.equal(
    timeline,
    'MARK at -490 ms; action 400 ms, from +0 ms to +400 ms; focus→button[Edit] at +60 ms; "Edit dialog pop up button" at +120 ms; "You are currently on a button. To display a list of optio..." at +200 ms; "Close, button" at +600 ms',
  );
  assert.equal(timeline.includes("\n"), false);
});

test("a timeline cuts a long phrase to 60 characters and a focused name to 40, keeping one line", () => {
  const long = `Name, edit text, first line\n${"x".repeat(80)}`;
  const timeline = speechTimeline({ records: ["Speech check", long], stamps: [0, 100], actionStart: 50, actionEnd: 60, focusMoves: [{ at: 55, tag: "input", name: "Recipe name ".repeat(10) }] });
  // MARK, the action, the focus move, then the phrase: in time order.
  const [mark, action, focus, phrase] = timeline.split("; ");
  assert.equal(mark, "MARK at -50 ms");
  assert.equal(action, "action 10 ms, from +0 ms to +10 ms");
  assert.equal(focus, "focus→input[Recipe name Recipe name Recipe name R...] at +5 ms");
  const text = "Name, edit text, first line " + "x".repeat(29) + "...";
  assert.equal(phrase, `"${text}" at +50 ms`);
  assert.equal(text.length, 60);
  assert.equal(timeline.includes("\n"), false);
});

test("a timeline with no MARK lists every phrase it was given, and a miss with one keeps its prefix, its heard list and its classes", () => {
  const timeline = speechTimeline({ records: ["Edit recipe, button"], stamps: [1_700], actionStart: 1_500, actionEnd: 1_520, focusMoves: [] });
  assert.equal(timeline, 'action 20 ms, from +0 ms to +20 ms; "Edit recipe, button" at +200 ms');
  const miss = '[sr] no utterance matched checked, after Space; heard: "unchecked Email me new recipes checkbox" | "You are currently on a checkbox"';
  const message = withTimeline(miss, timeline);
  assert.equal(message, `${miss} timeline: ${timeline}`);
  assert.equal(missedPhrase(message), true);
  assert.deepEqual(saidInMiss(message), saidInMiss(miss));
  assert.deepEqual(saidInMiss(withTimeline("[sr] no utterance matched checked, after Space; heard: nothing", timeline)), []);
  // The fail verdict's own message, with its timeline: the prefix and the heard list are what they were.
  const verdict = speechVerdict([], editTrigger, '"Edit", button', { now: 1_001, deadline: 1_000, ended: null });
  assert.deepEqual(saidInMiss(withTimeline(verdict.fail, timeline)), []);
  assert.equal(missedPhrase(withTimeline(verdict.fail, timeline)), true);
});

test("a missed step falls back to describing the focus only when VoiceOver said something, and nothing but its hints (#2085)", () => {
  const miss = (heard) => `[sr] no utterance matched "Dark", selected or checked, after ArrowRight; heard: ${heard} timeline: MARK at -1186 ms`;
  // Main's run 44579536643: only the hint of the radio button focus moved to.
  assert.deepEqual(hintOnlyMiss(miss('"You are currently on a selected radio button, 2 of 3."')), ["You are currently on a selected radio button, 2 of 3."]);
  assert.deepEqual(hintOnlyMiss(miss('"You are currently on a menu item. To choose this menu item, press Control-Option-Space." | "To exit this web area, press Control-Option-Shift-Up Arrow."')).length, 2);
  // Silence, a phrase that names something, and any other failure fail as they are.
  assert.equal(hintOnlyMiss(miss("nothing")), null);
  assert.equal(hintOnlyMiss(miss('"Light radio button, 1 of 3"')), null);
  assert.equal(hintOnlyMiss(miss('"You are currently on a radio button." | "Light radio button"')), null);
  assert.equal(hintOnlyMiss("[sr] infrastructure: VoiceOver's speech could not be read"), null);
});

test("every VoiceOver step's heard falls back on a hint-only miss, with the step's own matcher, unless SR_STRICT=1, and logs it for the lane to count", () => {
  const helpers = readFileSync(join(import.meta.dirname, "../registry/ouro/e2e/screen-reader/screen-reader.ts"), "utf8");
  const heard = helpers.slice(helpers.indexOf("export async function heard("), helpers.indexOf("export async function heardOrDescribed("));
  assert.match(heard, /process\.env\["SR_STRICT"\] !== "1" \? hintOnlyMiss\(error\.message\) : null/);
  assert.match(heard, /describesFocus\(sr, matches, /);
  // A describe that fails the matcher rethrows the step's own miss.
  assert.match(heard, /\.catch\(\(\) => \{\n\s+throw error;/);
  assert.match(heard, /console\.log\(`\$\{HINT_ONLY_PREFIX\} /);
  assert.ok(HINT_ONLY_PREFIX.startsWith("[sr] finding:"));
});
