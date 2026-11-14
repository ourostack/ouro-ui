// The single-file MCP App view's entry: OuroMcpApp with the catalog and options scripts/mcp-app.mts embedded in the
// page as JSON.
import { createRoot } from "react-dom/client";
import { OuroMcpApp } from "@/registry/ouro/components/ouro/mcp-app/ouro-mcp-app";
import "./view.css";

interface Config {
  catalog: unknown;
  handoffUrl?: string;
  appInfo?: { name: string; version: string };
}

const config = JSON.parse(document.getElementById("ouro-mcp-app-config")!.textContent!) as Config;
const template = config.handoffUrl;

createRoot(document.getElementById("root")!).render(
  <OuroMcpApp
    catalog={config.catalog}
    appInfo={config.appInfo}
    handoffUrl={template === undefined ? undefined : ({ action }) => template.replaceAll("{action}", encodeURIComponent(action))}
  />,
);
