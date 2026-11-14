// What agents write with ouro-mcp-app: snippets whose cases are in ouro-mcp-app.cases.ts.
import { OuroMcpApp } from "@/registry/ouro/components/ouro/mcp-app/ouro-mcp-app";

import catalog from "@/test/fixtures/a2ui/recipe.catalog.json";

export const ouroMcpApp01 = <OuroMcpApp catalog={catalog} onAction={() => {}} />;
export const ouroMcpAppOk01 = <OuroMcpApp catalog={catalog} handoffUrl={({ action }) => `https://kitchen.example.com/recipes?do=${action}`} appInfo={{ name: "Recipes", version: "1.0.0" }} className="max-w-md" />;
