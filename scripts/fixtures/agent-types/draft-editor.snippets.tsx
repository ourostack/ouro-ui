// What agents write with draft-editor: snippets whose cases are in draft-editor.cases.ts.
import { DraftEditor } from "@/registry/ouro/components/ouro/draft-editor/draft-editor";

export const draftEditor01 = <DraftEditor label="Reply" value="Hi" segments={[]} onValueChange={() => {}} provenance="agent" />;
export const draftEditor02 = <DraftEditor label="Reply" value="Hi" segments={[]} onValueChange={() => {}} readiness="done" />;
export const draftEditorOk01 = <DraftEditor label="Reply" value="Hi" segments={[{ author: "agent", text: "Hi" }]} onValueChange={() => {}} readiness="ready-for-review" readinessBy={{ author: "agent", name: "Ouro" }} readinessNote="Check the dates" readinessLabel="Ready" agentLabel="Written by an agent" actions={null} placeholder="Write a reply" rows={2} maxRows={8} className="mt-2" />;
