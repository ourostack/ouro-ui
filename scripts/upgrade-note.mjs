// Reads UPGRADING.md, the one source of "Upgrading from v0.1.0". gen-docs.mts copies its
// body into README.md, the site renders it on the Updating page, release.yml renders it into
// the release notes, and scripts/install-test.sh runs its commands:
//
//   node scripts/upgrade-note.mjs commands <step> --shadcn "<cli>" --address "<path with {name}>"
//
// prints step <step>'s commands, one per line, with each ourostack/ouro-ui/<item>#v0.2.0
// address pointed at a local registry file and `npx shadcn@latest` at a pinned CLI (`add`
// also gets --yes).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The note without its `# Upgrading from v0.1.0` title, which each place writes itself. */
export function noteBody(markdown) {
  return markdown.replace(/^# .*\n+/, "").trimEnd();
}

/** Each `#### <n>. <title>` step, with the lines of its `sh` code blocks. */
export function steps(markdown) {
  const out = [];
  let inCode = false;
  for (const line of markdown.split("\n")) {
    const heading = /^#### (\d+)\. (.*)$/.exec(line);
    if (heading && !inCode) {
      out.push({ number: Number(heading[1]), title: heading[2], commands: [] });
    } else if (line.startsWith("```")) {
      inCode = !inCode;
    } else if (inCode && line.trim() !== "") {
      out.at(-1)?.commands.push(line);
    }
  }
  return out;
}

/** A note command, run against a local registry with a pinned, non-interactive CLI. */
export function localCommand(command, { shadcn, address }) {
  return command
    .replaceAll("npx shadcn@latest add ", `${shadcn} add --yes `)
    .replaceAll("npx shadcn@latest ", `${shadcn} `)
    .replace(/ourostack\/ouro-ui\/([^\s#"'|]+)#v0\.2\.0/g, (_, name) => address.replace("{name}", name));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, number, ...rest] = process.argv.slice(2);
  const option = (name) => {
    const index = rest.indexOf(name);
    if (index === -1 || rest[index + 1] === undefined) throw new Error(`${name} is required`);
    return rest[index + 1];
  };
  if (mode !== "commands") throw new Error("usage: upgrade-note.mjs commands <step> --shadcn <cli> --address <path>");
  const step = steps(readFileSync(join(root, "UPGRADING.md"), "utf8")).find((item) => item.number === Number(number));
  if (!step || step.commands.length === 0) throw new Error(`UPGRADING.md has no commands in step ${number}`);
  const options = { shadcn: option("--shadcn"), address: option("--address") };
  for (const command of step.commands) console.log(localCommand(command, options));
}
