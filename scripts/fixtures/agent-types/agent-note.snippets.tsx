// What agents write with agent-note: snippets whose cases are in agent-note.cases.ts.
import { AgentNote } from "@/registry/ouro/components/ouro/agent-note/agent-note";

export const agentNote01 = <AgentNote text="Hi" author="agent" name="Ouro" by="agent" />;
export const agentNote02 = <AgentNote text="Hi" author="agent" name="Ouro" basis="Based on 3 messages" />;
export const agentNoteOk01 = <AgentNote text="Hi" author="agent" name="Ouro" time="5 min ago" source="Based on 3 messages" pinned={false} revision="r1" onPin={() => {}} onUnpin={() => {}} onSave={() => {}} onDismiss={() => {}} maxLength={500} label="Note" agentLabel="Agent" editedLabel="Edited by you" pinnedLabel="Pinned" keptLabel="Kept." changedLabel="Changed." pinButtonLabel="Pin" unpinButtonLabel="Unpin" editButtonLabel="Edit" saveButtonLabel="Save" cancelButtonLabel="Cancel" dismissButtonLabel="Dismiss" className="mt-2" />;
