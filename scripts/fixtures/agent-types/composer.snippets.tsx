// What agents write with composer: snippets whose cases are in composer.cases.ts.
import { Composer } from "@/registry/ouro/components/ouro/composer/composer";

export const composer01 = <Composer label="Message" onSend={() => {}} onSubmit={() => {}} />;
export const composer02 = <Composer label="Message" onSend={() => {}} submitOnEnter />;
export const composer03 = <Composer label="Message" onSend={() => {}} loading />;
export const composer04 = <Composer label="Message" onSend={() => {}} sendDisabled />;
export const composerOk01 = <Composer label="Message Mia" placeholder="Write a message" defaultValue="Hi" sendOn="mod-enter" sendLabel="Post" sendDisabledReason="Sending is off" description="Ctrl+Enter to send" highlights={[{ start: 0, end: 2, label: "Suggested" }]} onHighlightsChange={() => {}} rows={2} maxRows={6} onSend={(text) => void text} />;
