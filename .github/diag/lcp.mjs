// Diagnostic only (branch diag/webkit-frames): what the voyage's LCP is, and what its page weighs.
import { readdirSync, readFileSync } from "node:fs";
const label = process.argv[2];
for (const file of readdirSync(".lighthouseci").filter((name) => name.startsWith("lhr-") && name.endsWith(".json"))) {
  const lhr = JSON.parse(readFileSync(`.lighthouseci/${file}`, "utf8"));
  const audit = (id) => lhr.audits[id];
  const element = audit("largest-contentful-paint-element")?.details?.items?.[0]?.items?.[0]?.node;
  const phases = audit("largest-contentful-paint-element")?.details?.items?.[1]?.items?.map((item) => `${item.phase} ${Math.round(item.timing)}`).join(", ");
  const requests = audit("network-requests")?.details?.items ?? [];
  const doc = requests.find((item) => item.resourceType === "Document");
  const blocking = requests.filter((item) => item.resourceType === "Stylesheet" || item.resourceType === "Font").map((item) => `${item.url.split("/").pop()} ${item.transferSize}`).join(", ");
  const main = audit("mainthread-work-breakdown")?.details?.items?.map((item) => `${item.group} ${Math.round(item.duration)}`).join(", ");
  console.log(`${label} LCP ${Math.round(audit("largest-contentful-paint").numericValue)} FCP ${Math.round(audit("first-contentful-paint").numericValue)} · element ${element?.snippet?.slice(0, 120)} · phases ${phases} · document ${doc?.transferSize} (${doc?.resourceSize}) · css/fonts ${blocking} · main ${main} · dom ${audit("dom-size")?.numericValue}`);
}
