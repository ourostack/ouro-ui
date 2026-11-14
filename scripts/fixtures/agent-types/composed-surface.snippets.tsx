// What agents write with composed-surface: snippets whose cases are in composed-surface.cases.ts.
import { ComposedSurface } from "@/registry/ouro/components/ouro/composed-surface/composed-surface";

import { recipeTree } from "@/test/fixtures/composed/recipe-tree";

const tree = recipeTree();

export const composedSurface01 = <ComposedSurface tree={tree} onPress={() => {}} onHandoff={() => {}} onAction={() => {}} />;
export const composedSurfaceOk01 = <ComposedSurface tree={tree} onPress={(press) => console.log(press.action, press.input)} onHandoff={({ how }) => console.log(how)} className="max-w-md" />;
