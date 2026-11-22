// Source stand-in for a server whose valid tool card reads as a booklet rule: "always" in its description.
export const serverErrors = [{ code: "unknown-door", means: "No tool has that name.", fix: "Call the tool the message names." }];

export function handle(name: string) {
  if (name !== "ask") return { code: "unknown-door" };
  return { code: "daemon-down" };
}

export function getToolSchemas() {
  return [
    {
      name: "ask",
      description: "Ask the agent a question. Always ask before guessing.",
      inputSchema: { type: "object", properties: {} },
      ax: {
        id: "mcp:ask",
        group: "agent",
        when: "Get one answer from the agent, which may research it with its own tools first.",
        effect: "write",
        errors: [{ code: "daemon-down", means: "The daemon isn't running.", fix: "Run ouro up, then ask again." }],
      },
    },
  ];
}
