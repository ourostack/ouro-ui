// What agents write with a2ui-surface: snippets whose cases are in a2ui-surface.cases.ts.
import { A2UISurface } from "@/registry/ouro/components/ouro/a2ui-surface/a2ui-surface";

import recipeCase from "@/test/fixtures/a2ui/cases/recipe-card-agent.json";
import catalog from "@/test/fixtures/a2ui/recipe.catalog.json";

const messages = recipeCase.messages;

export const a2uiSurface01 = <A2UISurface catalog={catalog} messages={messages} onAction={() => {}} onHandoff={() => {}} onPress={() => {}} />;
export const a2uiSurfaceOk01 = <A2UISurface catalog={catalog} messages={messages} surfaceId="recipe-card" onAction={(m) => console.log(m.action)} onHandoff={({ how }) => console.log(how)} onProblems={(p) => console.log(p)} className="max-w-md" />;
