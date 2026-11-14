// What agents write with a2ui-surface: snippets whose cases are in a2ui-surface.cases.ts.
import { A2UISurface } from "@/registry/ouro/components/ouro/a2ui-surface/a2ui-surface";

declare const catalog: unknown;
declare const messages: unknown[];

export const a2uiSurface01 = <A2UISurface catalog={catalog} messages={messages} onAction={() => {}} onHandoff={() => {}} onPress={() => {}} />;
export const a2uiSurfaceOk01 = <A2UISurface catalog={catalog} messages={messages} surfaceId="card" onAction={(m) => console.log(m.action)} onHandoff={({ how }) => console.log(how)} onProblems={(p) => console.log(p)} className="max-w-md" />;
