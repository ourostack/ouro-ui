import { defineAction, defineActions, field } from "../../scripts/ouro-actions/ouro-actions.mts";

export const listTasks = defineAction({
  id: "list_tasks",
  consent: "read",
  label: "List tasks",
  description: "See the open and finished tasks.",
  agent: "List the tasks: each one's id, title and whether it is done. Take an id from here for complete_task.",
  input: {},
  output: { tasks: field.string({ label: "Tasks", description: "The tasks, as JSON." }) },
  cli: "tasks list",
});

export const completeTask = defineAction({
  id: "complete_task",
  consent: "write",
  label: "Complete task",
  description: "Mark one task done.",
  agent: "Mark one task done. Take the id from list_tasks.",
  input: { id: field.string({ label: "Task id", description: "The task's id, from list_tasks.", arg: true }) },
  output: { id: field.string({ label: "Task id", description: "The task that was completed." }) },
  cli: "tasks complete",
});

export default defineActions("standalone-tasks", [listTasks, completeTask], { tool: "tasks" });
