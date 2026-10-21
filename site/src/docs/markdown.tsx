import type { JSX, ReactNode } from "react";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { CodeBlock, InlineCode } from "../components/code";
import { GITHUB } from "../paths";

/**
 * Renders the Markdown that scripts/gen-docs.mts writes. It is a small, fixed subset,
 * so a parser this size covers it: `#` headings, paragraphs, fenced code, pipe tables,
 * `-` lists, inline code and links, and the claim syntax (docs/guides/claims.md): a link's
 * `"verify:…"` title, and footnotes (`[^id]` with `[^id]: <source> verify:<check>`), which
 * gather into a Claim sources list at the end. Anything else would be a gen-docs change, and the
 * docs tests would show it.
 */
export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "code"; lang: string; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "sources"; items: Array<{ id: string; text: string }> };

/** Splits a table row on unescaped pipes. */
function cells(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

export function parse(markdown: string): Block[] {
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, "").split("\n");
  const blocks: Block[] = [];
  const sources: Array<{ id: string; text: string }> = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const footnote = /^\[\^([^\]]+)\]:\s?(.*)$/.exec(line);
    if (line.trim() === "") {
      i++;
    } else if (footnote) {
      let text = footnote[2]!;
      i++;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]!)) text += ` ${lines[i++]!.trim()}`;
      sources.push({ id: footnote[1]!, text });
    } else if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) body.push(lines[i++]!);
      i++;
      blocks.push({ kind: "code", lang, text: body.join("\n") });
    } else if (/^#{1,6} /.test(line)) {
      const level = line.indexOf(" ");
      blocks.push({ kind: "heading", level, text: line.slice(level + 1).trim() });
      i++;
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith("|")) rows.push(cells(lines[i++]!));
      const [header = [], , ...body] = rows;
      blocks.push({ kind: "table", header, rows: body });
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("- ")) items.push(lines[i++]!.slice(2).trim());
      blocks.push({ kind: "list", items });
    } else {
      const text: string[] = [];
      while (i < lines.length && lines[i]!.trim() !== "" && !/^(#{1,6} |```|\||- |\[\^[^\]]+\]:)/.test(lines[i]!)) text.push(lines[i++]!.trim());
      blocks.push({ kind: "paragraph", text: text.join(" ") });
    }
  }
  if (sources.length > 0) blocks.push({ kind: "sources", items: sources });
  return blocks;
}

/**
 * A claim's source (docs/guides/claims.md) as an address: a repository path (`path#L12@sha`),
 * `test:<file>::<name>` or `evidence:<path>` opens the file on GitHub; an address is itself.
 */
export function sourceHref(source: string): string {
  if (/^https?:\/\//.test(source)) return source;
  const path = source.replace(/^test:/, "").replace(/::[\s\S]*$/, "").replace(/^evidence:/, "");
  const [, file = "", line, commit] = /^([^#@]*)(?:#L(\d+))?(?:@(\w+))?$/.exec(path) ?? [];
  return `${GITHUB}/blob/${commit ?? "main"}/${file}${line ? `#L${line}` : ""}`;
}

/** A footnote's body: its sources as links, then its checks as code. */
function sourceBody(text: string): ReactNode[] {
  const at = text.search(/(?:^|\s)verify:/);
  const sources = (at === -1 ? text : text.slice(0, at)).split(/\s*;\s*/).map((source) => source.trim()).filter(Boolean);
  const checks = at === -1 ? [] : text.slice(at).split(/(?:^|\s+)verify:/).map((check) => check.trim()).filter(Boolean);
  const out: ReactNode[] = [];
  sources.forEach((source, index) => {
    if (index > 0) out.push("; ");
    out.push(
      <a key={`source-${index}`} href={sourceHref(source)} className="font-medium text-primary underline underline-offset-4 [overflow-wrap:anywhere]">
        {source}
      </a>,
    );
  });
  for (const [index, check] of checks.entries()) out.push(" ", <InlineCode key={`check-${index}`}>{`verify:${check}`}</InlineCode>);
  return out;
}

/** A heading's anchor: `Use instead when` becomes `use-instead-when`. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Inline code and links. `link` maps a Markdown href to the site's. */
export function inline(text: string, link: (href: string) => string = (href) => href): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /`([^`]+)`|\[\^([^\]]+)\]|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    if (match[1] !== undefined) out.push(<InlineCode key={match.index}>{match[1]}</InlineCode>);
    else if (match[2] !== undefined)
      out.push(
        <sup key={match.index}>
          <a href={`#source-${slug(match[2])}`} aria-label={`Source: ${match[2]}`} className="text-primary underline underline-offset-2">
            {match[2]}
          </a>
        </sup>,
      );
    else
      out.push(
        <a key={match.index} href={link(match[4]!)} className="font-medium text-primary underline underline-offset-4">
          {inline(match[3]!, link)}
        </a>,
      );
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ blocks, link }: { blocks: Block[]; link?: (href: string) => string }): JSX.Element {
  // Each scrollable table is a named region; name it after its section, uniquely.
  const labels = new Map<number, string>();
  const used = new Set<string>();
  let section = "Table";
  blocks.forEach((block, index) => {
    if (block.kind === "heading") section = block.text.replace(/`/g, "");
    if (block.kind !== "table") return;
    let label = section;
    for (let n = 2; used.has(label); n++) label = `${section} (${n})`;
    used.add(label);
    labels.set(index, label);
  });
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading":
            return block.level <= 2 ? (
              <Heading key={index} level={2} size="lg" id={slug(block.text)} className="mt-14 mb-4 scroll-mt-6">
                {inline(block.text, link)}
              </Heading>
            ) : (
              <Heading key={index} level={3} size="sm" id={slug(block.text)} className="mt-8 mb-3 scroll-mt-6">
                {inline(block.text, link)}
              </Heading>
            );
          case "paragraph":
            return (
              <Text key={index} className="my-3 max-w-[68ch]">
                {inline(block.text, link)}
              </Text>
            );
          case "code":
            return <CodeBlock key={index} code={block.text} className="my-4" />;
          case "list":
            return (
              <ul key={index} className="my-3 grid max-w-[68ch] list-disc gap-2 ps-5 marker:text-muted-foreground">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Text as="span">{inline(item, link)}</Text>
                  </li>
                ))}
              </ul>
            );
          case "table":
            return <Table key={index} label={labels.get(index)!} header={block.header} rows={block.rows} link={link} />;
          case "sources":
            return (
              <section key={index} aria-labelledby="claim-sources" className="mt-14">
                <Heading level={2} size="lg" id="claim-sources" className="mb-4">
                  Claim sources
                </Heading>
                <ul className="grid max-w-[68ch] gap-2">
                  {block.items.map((item) => (
                    <li key={item.id} id={`source-${slug(item.id)}`} className="scroll-mt-6">
                      <Text as="span">
                        <span className="font-medium text-foreground">{item.id}:</span> {sourceBody(item.text)}
                      </Text>
                    </li>
                  ))}
                </ul>
              </section>
            );
        }
      })}
    </>
  );
}

function Table({
  label,
  header,
  rows,
  link,
}: {
  label: string;
  header: string[];
  rows: string[][];
  link?: ((href: string) => string) | undefined;
}) {
  // From 640px up, a table that scrolls inside its own box if it must (a tab stop, so a
  // keyboard can scroll it). On phones, one card per row: the first cell as its title,
  // short cells as labeled lines, the last cell as a paragraph. The page never scrolls sideways.
  const last = header.length - 1;
  return (
    <>
    <dl aria-label={label} className="my-4 grid gap-0 overflow-hidden rounded-lg border border-border sm:hidden">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="grid gap-1.5 border-b border-border p-4 last:border-b-0">
          <dt className="text-sm font-medium text-foreground">{inline(row[0] ?? "", link)}</dt>
          {row.slice(1).map((cell, cellIndex) =>
            cell === "" ? null : cellIndex + 1 === last && last > 1 ? (
              <dd key={cellIndex} className="m-0 text-sm leading-6 text-muted-foreground">
                {inline(cell, link)}
              </dd>
            ) : (
              <dd key={cellIndex} className="m-0 text-sm leading-6 text-muted-foreground">
                <span className="text-foreground">{header[cellIndex + 1]}:</span> {inline(cell, link)}
              </dd>
            ),
          )}
        </div>
      ))}
    </dl>
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="my-4 hidden overflow-x-auto rounded-lg border border-border outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 sm:block [&_code]:[overflow-wrap:normal]"
    >
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            {header.map((cell, index) => (
              <th key={index} scope="col" className="px-3 py-2.5 align-bottom font-medium text-foreground">
                {inline(cell, link)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border last:border-b-0">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={
                    cellIndex === 0
                      ? "px-3 py-2.5 align-top whitespace-nowrap text-foreground"
                      : "px-3 py-2.5 align-top leading-6 text-muted-foreground"
                  }
                >
                  {inline(cell, link)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
