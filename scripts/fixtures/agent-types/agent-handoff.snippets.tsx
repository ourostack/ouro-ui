// What agents write with agent-handoff: snippets whose cases are in agent-handoff.cases.ts.
import { AgentHandoff } from "@/registry/ouro/components/ouro/agent-handoff/agent-handoff";

export const agentHandoff01 = <AgentHandoff label="Hand it to your agent" prompt="P" text="Read https://example.com/llms.txt" />;
export const agentHandoff02 = <AgentHandoff label="Hand it to your agent" prompt="P" command="npx shadcn add" />;
export const agentHandoff03 = <AgentHandoff label="L" prompt="P" title="Hand it to your agent" />;
export const agentHandoff04 = <AgentHandoff label="L" prompt="P" description="Paste it." />;
export const agentHandoffOk01 = <AgentHandoff label="Hand it to your agent" prompt="Read https://example.com/llms.txt" caption="Paste it." aside={null} copyLabel="Copy" copiedLabel="Copied" failedMessage="Select it." className="mt-8" />;
