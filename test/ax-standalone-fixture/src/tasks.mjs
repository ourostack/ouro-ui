// The app's existing service. Nothing here knows about Ouro: the screen and the MCP door both call these functions.
const tasks = [
  { id: "t1", title: "Send the quarterly report", done: false },
  { id: "t2", title: "Book the venue", done: true },
];

export const handlers = {
  list_tasks: () => ({ tasks: JSON.stringify(tasks) }),
  complete_task: ({ id }) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) throw new Error(`there is no task "${id}". Fix: call list_tasks and use one of its ids.`);
    task.done = true;
    return { id: task.id };
  },
};
