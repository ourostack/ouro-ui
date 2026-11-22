// Source stand-in for a server with two booklet-word tools: "ask" is weak only for its booklet word, and "status" is
// weak for its effect too.
export const serverErrors = [{ code: "unknown-door", means: "No tool has that name.", fix: "Call the tool the message names." }];

export function handle(name: string) {
  if (name !== "ask" && name !== "status") return { code: "unknown-door" };
  return { code: "daemon-down" };
}

export function getToolSchemas() {
  return [
    {
      name: "ask",
      description: "Ask the agent a question. Always ask before guessing.",
      inputSchema: { type: "object", properties: {} },
      ax: { id: "mcp:ask", group: "agent", when: "Get one answer from the agent, which may research it with its own tools first.", effect: "write", errors: [{ code: "daemon-down", means: "The daemon isn't running.", fix: "Run ouro up, then ask again." }] },
    },
    {
      name: "status",
      description: "Read the agent's status. Never guess it.",
      inputSchema: { type: "object", properties: {} },
      ax: { id: "mcp:status", group: "agent", when: "See whether the agent is running and what it is working on.", effect: "sometimes", errors: [{ code: "daemon-down", means: "The daemon isn't running.", fix: "Run ouro up, then ask again." }] },
    },
  ];
}
