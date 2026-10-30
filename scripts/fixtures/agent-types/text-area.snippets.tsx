// What agents write with text-area: snippets whose cases are in text-area.cases.ts.
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";

export const s48 = <TextArea label="Notes" minRows={2} />;
export const s49 = <TextArea label="Notes" autoResize />;
export const textArea01 = <TextArea label="Reply" marks={[{ start: 0, end: 5 }]} />;
export const ok12 = <TextArea label="Notes" name="notes" description="Only you see these." autoGrow rows={2} maxRows={8} variant="plain" size="lg" />;
export const textAreaOk01 = <TextArea label="Reply" defaultValue="Hello there" highlights={[{ start: 0, end: 5, label: "Suggested by your assistant", tone: "primary", id: "hello" }]} onHighlightsChange={() => {}} />;
