import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CHECKBOX, CHECKED, firstMatch, inOneSentence, MARK, nameAndRole, readRecords, saysValue, spokenAfter, UNCHECKED, withoutHints } from "../registry/ouro/e2e/screen-reader/phrases.ts";

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
