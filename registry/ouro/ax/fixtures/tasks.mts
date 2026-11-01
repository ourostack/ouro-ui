import { quietPipes, runCli } from "../cli.ts";
import { defineCli, defineCommand } from "../command.ts";
import { AxError } from "../problem.ts";
import { outcome } from "../outcome.ts";

const tasks = new Map([["t1", { title: "Book the room", owner: "Sam" }]]);
const team = { only: false, who: "the team" };
function task(id: unknown) {
  const found = tasks.get(String(id));
  if (!found) throw new AxError({ code: "no-task", exit: 1, thing: "task", problem: `there is no task "${String(id)}"`, fix: "tasks list" });
  return found;
}

const cli = defineCli({
  name: "tasks",
  about: ["tasks: the team's task list, for agents."],
  commands: [
    defineCommand({ name: "list", summary: "The tasks, with their ids.", effect: "private", readOnly: true, examples: ["tasks list"], run: () => [...tasks].map(([ref, t]) => ({ ref, ...t })) }),
    defineCommand({
      name: "assign", summary: "Give a task to someone; the team sees it.", effect: "others", examples: ['tasks assign t1 Ana --why "Sam asked"'],
      args: [{ name: "task", description: "A task id.", required: true, source: "list" }, { name: "person", description: "Who takes it.", required: true }],
      plan: (i) => outcome({ action: "assign", effect: "others", audience: team, state: "planned", summary: `Would give "${task(i["task"]).title}" to ${String(i["person"])}; the team will see it.` }),
      run: (i) => {
        const t = task(i["task"]);
        t.owner = String(i["person"]);
        return outcome({ action: "assign", effect: "others", audience: team, state: "done", summary: `Gave "${t.title}" to ${t.owner}.`, postcondition: { checked: true, holds: tasks.get(String(i["task"]))?.owner === t.owner, how: "read the task back" }, receipt: { id: `a-${String(i["task"])}`, at: new Date().toISOString(), by: "agent", why: String(i["why"]) } });
      },
    }),
  ],
});
quietPipes(process);
process.exitCode = await runCli(cli, process.argv.slice(2), process);
