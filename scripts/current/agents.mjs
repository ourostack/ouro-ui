// Ouro UI's bar, for every agent that works in a repository Ouro Current keeps: a few lines in the repository's
// AGENTS.md, between markers, which each update brings in step with BAR. The rest of AGENTS.md is the repository's own
// and is never touched. A repository that wants its AGENTS.md left alone lists it under `ignore` in
// .github/ouro-current.json; one with no AGENTS.md gets nothing.

import { Buffer } from "node:buffer";

export const AGENTS_PATH = "AGENTS.md";
/** The byte budgets ourostack's agents-md-budget.mjs holds AGENTS.md to, which the block's bytes move with. */
export const BUDGET_PATH = ".github/agents-md-budget.json";
const START = "<!-- ouro-ui:bar -->";
const END = "<!-- /ouro-ui:bar -->";

export const BAR = [
  "**The bar, for people and agents alike** ([design craft](https://ui.ouroboros.bot/docs/design-craft/#the-bar)): would the people who made the Mac and the iPhone ship it? Whenever you scope or design something a person or an agent meets (a screen, a menu, a setting, a command, an action, a tool, a line of output):",
  "",
  "1. Start from the jobs people do, in their words. Read a reference product's items, a service's functions or an API's fields as evidence of jobs, never as the list to build.",
  "2. Make the first cut restraint: for each thing, name the job it serves and ask what breaks if it goes; if nothing does, leave it out and say why. Give each job one way in, not one per item or function, and extend the one that exists before adding another.",
  "3. Build what is left well, the basics people use daily among it, for the person and for agents, with a result that says what it did.",
  "4. Write how fresh people or fresh agents doing a real job will prove it, and rerun them after each small change.",
].join("\n");

const BLOCK = `${START}\n${BAR}\n${END}`;

/**
 * AGENTS.md with the block in step: replaced where its markers are; otherwise added after the paragraph that points at
 * ourostack's "Interfaces follow Ouro UI" rule, which it belongs beside, or at the end. Null when it is already in step.
 */
export function withBar(text) {
  const start = text.indexOf(START);
  const end = start === -1 ? -1 : text.indexOf(END, start);
  if (end !== -1) {
    const next = text.slice(0, start) + BLOCK + text.slice(end + END.length);
    return next === text ? null : next;
  }
  const lines = text.split("\n");
  let at = lines.findIndex((line) => line.includes("interfaces-follow-ouro-ui"));
  if (at === -1) return `${text.replace(/\s*$/, "")}\n\n${BLOCK}\n`;
  while (at + 1 < lines.length && lines[at + 1].trim() !== "") at++;
  lines.splice(at + 1, 0, "", BLOCK);
  return lines.join("\n");
}

/** The files and notes that bring AGENTS.md's block in step, with its byte budget moved by what the block adds. */
export async function agentsBar(read) {
  const text = await read(AGENTS_PATH);
  const next = text === null ? null : withBar(text);
  if (next === null) return { files: {}, notes: [] };
  const files = { [AGENTS_PATH]: next };
  const notes = ["Brings Ouro UI's bar for people and agents into `AGENTS.md`, between `ouro-ui:bar` markers that Ouro Current keeps in step; to leave `AGENTS.md` alone, add it to `ignore` in `.github/ouro-current.json`."];
  const budgetText = await read(BUDGET_PATH);
  const budgets = budgetText === null ? null : JSON.parse(budgetText);
  if (typeof budgets?.[AGENTS_PATH] === "number") {
    budgets[AGENTS_PATH] += Buffer.byteLength(next) - Buffer.byteLength(text);
    files[BUDGET_PATH] = `${JSON.stringify(budgets, null, 2)}\n`;
    notes.push("Its budget in `.github/agents-md-budget.json` moves by the block's bytes alone, so the rest of the file keeps the room it had.");
  }
  return { files, notes };
}
