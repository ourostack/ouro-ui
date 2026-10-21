import type { JSX, ReactNode } from "react";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { Heading } from "@/registry/ouro/components/ouro/text/heading";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { agentExamples } from "../agents/examples";
import { CodeBlock, Command, InlineCode } from "../components/code";
import { DocsShell } from "../components/layout";
import { LiveDemo } from "../components/live-demo";
import { siteGroups } from "../../../scripts/catalog-groups.mts";
import { loadMarkdown } from "../docs/content";
import { docsItems, GITHUB, installedPaths, itemFiles, itemMarkdown, partsSection, type DocsItem } from "../docs/items";
import { inline, Markdown, parse, type Block } from "../docs/markdown";
import { docsPages, exportPages, guidePages, pageMarkdown, publishedName, repositoryLink, type DocsPage } from "../docs/pages";
import { href, routeFor } from "../routes";
import { latestRelease, upgrading } from "../release";

function PageTitle({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: ReactNode }): JSX.Element {
  return (
    <header className="mb-10">
      <p className="m-0 mb-3 text-sm font-medium text-primary">{eyebrow}</p>
      <Heading level={1} size="2xl">
        {title}
      </Heading>
      <Text size="lg" tone="muted" className="mt-4 max-w-[40rem] text-pretty">
        {lead}
      </Text>
    </header>
  );
}

/** The generated page's blocks, split into its purpose, its import line and the rest. */
function pageBlocks(item: DocsItem): { purpose: string; importLine: string; body: Block[] } {
  const blocks = parse(installedPaths(itemMarkdown(item)));
  const [, purpose, importBlock, ...rest] = blocks;
  if (purpose?.kind !== "paragraph" || importBlock?.kind !== "code") throw new Error(`docs/${item.title}.md changed shape`);
  // The "Parts" section links to docs/parts.md; the site shows that nesting in place.
  const body = rest.map((block) =>
    block.kind === "paragraph"
      ? { ...block, text: block.text.replace(/ See \[parts\.md\]\(parts\.md#[\w-]+\) for the required nesting\./, " The nesting they need follows.") }
      : block,
  );
  if (item.parts) {
    const at = body.findIndex((block) => block.kind === "heading" && block.text === "Parts");
    const next = body.findIndex((block, index) => index > at && block.kind === "heading" && block.level <= 2);
    // Without the family's opening line, which repeats the root part's description.
    const parts = parse(installedPaths(partsSection(item.parts))).slice(1);
    body.splice(next === -1 ? body.length : next, 0, ...parts);
  }
  return { purpose: purpose.text, importLine: importBlock.text, body };
}

export function DocsComponent({ item }: { item: DocsItem }): JSX.Element {
  const { purpose, importLine, body } = pageBlocks(item);
  return (
    <DocsShell current={`/docs/${item.name}/`}>
      <PageTitle eyebrow={item.group} title={item.title} lead={inline(purpose)} />
      <section
        aria-label="Live demo"
        className="flex min-h-48 items-center justify-center rounded-2xl border border-border bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px] px-5 py-10 sm:px-10"
      >
        <LiveDemo name={item.name} title={item.title} />
      </section>

      <Heading level={2} size="lg" id="install" className="mt-14 mb-4">
        Install
      </Heading>
      <div className="grid gap-3">
        <Text size="sm" tone="muted">
          {claim("Once per app, with Tailwind CSS v4", { source: { file: "test/install-fixture/package.json" }, verify: { fileLine: "test/install-fixture/package.json", pattern: '"tailwindcss": "\\^4\\.' } })} and an <InlineCode>@/*</InlineCode> path alias (Ouro HX is built on Base UI, so{" "}
          <InlineCode>--base base</InlineCode>; skip <InlineCode>-t</InlineCode> in an existing app):
        </Text>
        <Command command="npx shadcn@latest init --base base --preset nova --yes --no-monorepo" />
        <Command command={`npx shadcn@latest add ourostack/ouro-ui/ouro-base#${latestRelease}`} />
        <Text size="sm" tone="muted">
          Then the component.{" "}
          {claim("From v0.8.0 it installs only the helpers it imports and never touches your stylesheet", { source: { spec: "https://github.com/ourostack/ouro-ui/releases/tag/v0.8.0" }, verify: [{ urlOk: "https://github.com/ourostack/ouro-ui/releases/tag/v0.8.0" }, { testExists: "scripts/registry.test.mjs::only ouro-base and ouro-theme touch the app's stylesheet, and no other item installs them" }, { testExists: "scripts/registry.test.mjs::each lib helper is its own item, so an item installs only the helpers it imports" }] })} (
          <a href={href("/docs/installing/")} className="text-primary underline underline-offset-4">Installing</a>):
        </Text>
        <Command command={`npx shadcn@latest add ourostack/ouro-ui/${item.name}#${latestRelease}`} />
        <Text size="sm" tone="muted">
          Or, with the <a href={`${href("/")}#install`} className="text-primary underline underline-offset-4">@ouro namespace</a> set
          up:
        </Text>
        <Command command={`npx shadcn@latest add @ouro/ouro-base @ouro/${item.name}`} />
        <Text size="sm" tone="muted">
          Its tests, stories and Playwright spec are optional.{" "}
          {claim("They need Vitest 4.1.11 or later, and from v0.8.0 never change a version your app has", {
            source: [{ file: "scripts/registry.mts" }, { spec: "https://github.com/ourostack/ouro-ui/releases/tag/v0.8.0" }],
            verify: [
              { fileLine: "scripts/registry.mts", pattern: 'vitest: "4\\.1\\.11"' },
              { urlOk: "https://github.com/ourostack/ouro-ui/releases/tag/v0.8.0" },
              { testExists: "scripts/registry.test.mjs::devDependencies are named without a version, so the CLI installs it only when the app lacks it and never changes a version the app has" },
            ],
          })}{" "}
          (<a href={href("/docs/testing/")} className="text-primary underline underline-offset-4">Testing</a>):
        </Text>
        <Command command={`npx shadcn@latest add ourostack/ouro-ui/${item.name}#${latestRelease} ourostack/ouro-ui/${item.name}-tests#${latestRelease}`} />
        <CodeBlock code={importLine} className="mt-2" />
        <Text size="sm" tone="muted">
          Paths use shadcn's default <InlineCode>@/</InlineCode> alias; the CLI rewrites them to yours.
        </Text>
      </div>

      <Markdown blocks={body} link={(target) => siteLink(target, `docs/${item.title}.md`)} />

      <div className="mt-14 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 text-sm">
        <a href={`${GITHUB}/blob/main/${item.source}`} className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Source on GitHub
        </a>
        <a href={href(`/docs/${item.name}.md`)} className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
          This page as Markdown
        </a>
      </div>
    </DocsShell>
  );
}

/** Where a link in a docs Markdown file goes on the site: another docs file becomes its page, another repository file its page on GitHub. */
function siteLink(target: string, from: string): string {
  const to = publishedName(target, from);
  return to ? `${href(`/docs/${to.name}/`)}${to.fragment}` : (repositoryLink(target, from) ?? target);
}

/**
 * A page that is not a registry item's: a guide (docs/guides) or a documented export with no
 * item of its own (Radio, OuroProvider). Links between Markdown files go to the site's pages.
 */
export function DocsPageView({ page }: { page: DocsPage }): JSX.Element {
  const [, lead, ...body] = parse(installedPaths(pageMarkdown(page)));
  if (lead?.kind !== "paragraph") throw new Error(`${page.file} must start with a title and a one-paragraph summary`);
  const link = (target: string) => siteLink(target, page.file);
  return (
    <DocsShell current={`/docs/${page.name}/`}>
      <PageTitle eyebrow={page.group} title={page.title} lead={inline(lead.text, link)} />
      <Markdown blocks={body} link={link} />
      <div className="mt-14 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 text-sm">
        <a href={`${GITHUB}/blob/main/${page.file}`} className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Source on GitHub
        </a>
        <a href={href(`/docs/${page.name}.md`)} className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
          This page as Markdown
        </a>
      </div>
    </DocsShell>
  );
}

export function DocsIndex(): JSX.Element {
  // Every catalog group that has a component, in catalog order, App setup last.
  const groups = siteGroups.filter((group) => docsItems.some((item) => item.group === group));
  /** An id for a group's heading: "App setup" has a space, which an id may not. */
  const groupId = (group: string) => `group-${group.toLowerCase().replace(/\s+/g, "-")}`;
  const card =
    "group grid h-full gap-1.5 rounded-xl border border-border p-4 no-underline outline-ring transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2";
  return (
    <DocsShell current="/docs/">
      <PageTitle
        eyebrow="Docs"
        title="Components"
        lead={claim("Every Ouro HX component, with a live demo, install commands, its props and what to use instead. The same docs live in each component's JSDoc, so an agent reading the installed source sees them too.", {
          source: [{ file: "site/src/site.test.tsx" }, { file: "scripts/gen-docs.mts" }],
          verify: [{ testExists: "site/src/site.test.tsx::docs > has a page for every registry item at docs/<name>" }, { fileLine: "scripts/gen-docs.mts", pattern: "from the JSDoc and prop types in" }],
        })}
      />
      {groups.map((group) => (
        <section key={group} aria-labelledby={groupId(group)} className="mt-10">
          <Heading level={2} size="md" id={groupId(group)} className="mb-4">
            {group}
          </Heading>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
            {docsItems
              .filter((item) => item.group === group)
              .map((item) => (
                <li key={item.name}>
                  <a href={href(`/docs/${item.name}/`)} className={card}>
                    <span className="font-medium text-foreground">{item.title}</span>
                    <span className="text-sm leading-6 text-muted-foreground">{inline(item.summary)}</span>
                  </a>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <section aria-labelledby="group-more" className="mt-10">
        <Heading level={2} size="md" id="group-more" className="mb-4">
          Parts and app setup
        </Heading>
        <Text size="sm" tone="muted" className="mb-4 max-w-[40rem]">
          Pages for the exports that install with another component, or with the helpers in <InlineCode>lib/ouro</InlineCode>.
        </Text>
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
          {exportPages.map((page) => (
            <li key={page.name}>
              <a href={href(`/docs/${page.name}/`)} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4 sm:min-h-6">
                {page.title}
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="group-guides" className="mt-10">
        <Heading level={2} size="md" id="group-guides" className="mb-4">
          Guides
        </Heading>
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
          {guidePages.map((page) => (
            <li key={page.name}>
              <a href={href(`/docs/${page.name}/`)} className={card}>
                <span className="font-medium text-foreground">{page.title}</span>
                <span className="text-sm leading-6 text-muted-foreground">{inline(page.summary)}</span>
              </a>
            </li>
          ))}
          <li>
            <a href={href("/docs/switching-from-shadcn/")} className={card}>
              <span className="font-medium text-foreground">Switching from shadcn</span>
              <span className="text-sm leading-6 text-muted-foreground">shadcn/ui components and props, and their Ouro HX equivalents.</span>
            </a>
          </li>
          <li>
            <a href={href("/docs/updating/")} className={card}>
              <span className="font-medium text-foreground">Updating installed components</span>
              <span className="text-sm leading-6 text-muted-foreground">Review upstream changes, then overwrite and reapply your edits.</span>
            </a>
          </li>
        </ul>
      </section>
    </DocsShell>
  );
}

const switchingIntro = `Ouro HX follows the shadcn/ui registry standard and reads the same theme variables, so switching is one component at a time, not a migration.`;

const switchingCoexist = `
## Both live in one app

shadcn/ui installs to \`components/ui/\`. Ouro HX installs to \`components/ouro/\`, so a shadcn \`button\` and an Ouro \`button\` never collide.[^beside] Switch a screen at a time, and remove the shadcn file when nothing imports it any more.

Ouro components read shadcn's variables (\`--primary\`, \`--muted-foreground\`, \`--radius\` and the rest), so your theme carries over unchanged. Dark mode is the same \`.dark\` class. Ouro HX adds only what shadcn themes lack, in \`ouro-base.css\`: \`--success\` and \`--warning\` with their foregrounds, \`--destructive-foreground\`, the motion tokens, and \`--ouro-layer\`, the z-index of sheets and dialogs (50, as in shadcn's overlays; raise it if your app has fixed bars above z-50).[^layer] To change any \`--ouro-*\` token, such as \`--ouro-layer\`, \`--ouro-press-scale\` or \`--ouro-backdrop-max\`, set it in a \`:root\` (or \`.dark\`) rule of your own after the Ouro tokens, outside any \`@layer\`. Don't edit the lines shadcn wrote: every \`shadcn add\` of an Ouro item rewrites them. The Ouro look (\`ouro-theme\`) is optional; skip it to keep yours.

## Components

| shadcn/ui | Ouro HX | Notes |
| --- | --- | --- |
| \`Button\` | \`Button\` | Same name; the props differ (below). |
| \`Dialog\` with \`DialogTrigger\`, \`DialogContent\`, \`DialogHeader\`, \`DialogTitle\`, \`DialogDescription\`, \`DialogFooter\` | \`Dialog\` with \`trigger\`, \`title\`, \`description\` and \`footer\` | Becomes a bottom sheet below 640px.[^dialog-sheet] Parts exist for layouts the props can't express. |
| \`Sheet\` with \`SheetTrigger\`, \`SheetContent\`, \`SheetHeader\`, \`SheetTitle\` | \`Sheet\` with \`trigger\`, \`side\` and \`title\` | Dragged back to its edge to dismiss. |
| \`Drawer\` | \`Sheet\` with \`snapPoints\` | \`snapPoints={[0.5, 1]}\` opens at half height. |
| \`AlertDialog\` | \`ConfirmDialog\` | Cancel has focus first; an outside press doesn't dismiss it. |
| Classes on \`<h1>\` to \`<h6>\` | \`Heading\` with \`level\` and \`size\` | \`level\` sets the tag; \`size\` only the look. |
| Classes on \`<p>\` (\`text-sm text-muted-foreground\`) | \`Text\` with \`size\` and \`tone\` | \`<Text size="sm" tone="muted">\` |

## Button props

| shadcn/ui | Ouro HX |
| --- | --- |
| \`variant="default"\` | The default: \`<Button>\` |
| \`variant="destructive"\` | \`tone="destructive"\` |
| \`variant="secondary"\` | \`tone="secondary"\` |
| \`variant="outline"\` | \`variant="outline" tone="secondary"\` |
| \`variant="ghost"\` | \`variant="plain"\`, with \`tone="secondary"\` for foreground-colored text |
| \`variant="link"\` | \`variant="plain"\` with \`href\` |
| \`size="default"\` | \`size="md"\`, the default |
| \`asChild\` around a link | \`href\`, which renders a link (internal paths go through \`OuroProvider\`'s \`linkComponent\`) |
| \`disabled\` while saving | \`loading\`, which also shows a spinner and keeps focus |
| An icon as a child | \`startIcon={Icon}\` or \`endIcon={Icon}\` |
| \`className="w-full"\` | \`fullWidth\` |
| Appearance classes (\`bg-red-500\`) | \`tone\`, \`variant\` and \`size\`; \`className\` is for layout |

## Dialog and Sheet props

| shadcn/ui | Ouro HX |
| --- | --- |
| \`open\` and \`onOpenChange\` | The same |
| \`<DialogTrigger asChild>\` around a button | \`trigger={<Button>Edit</Button>}\` |
| \`<DialogTitle>\` | \`title\`, required (\`hideTitle\` hides it visually) |
| \`<DialogDescription>\` | \`description\` |
| \`<DialogFooter>\` | \`footer\`, primary action last |
| \`<SheetContent side="right">\` | \`<Sheet side="right">\` |

## AlertDialog to ConfirmDialog

| shadcn/ui | Ouro HX |
| --- | --- |
| \`<AlertDialogTitle>\` | \`title\`, the question |
| \`<AlertDialogDescription>\` | \`description\` |
| \`<AlertDialogAction onClick={…}>Delete</AlertDialogAction>\` | \`confirmLabel="Delete"\` and \`onConfirm\`; return a promise to show progress |
| \`<AlertDialogCancel>\` | \`cancelLabel\`, \`"Cancel"\` by default |
| A destructive class on the action | \`tone="destructive"\` |

## If you miss one

Shadcn's prop names that Ouro HX doesn't use, and its Button variant and size values, fail the type check, and the error names the Ouro prop to use. In development, Button's console message names the fix for each guard prop and each shadcn variant and size:[^button-guards]

[^beside]: scripts/install-test.sh; .github/workflows/ci.yml verify:fileLine(scripts/install-test.sh, /Stock shadcn button beside Ouro's/) verify:ciJob(ci.yml#install)
[^layer]: registry/ouro/theme/ouro-base.css; https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/dialog.tsx verify:fileLine(registry/ouro/theme/ouro-base.css, /--ouro-layer: 50;/) verify:urlOk(https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/dialog.tsx)
[^dialog-sheet]: test:registry/ouro/components/ouro/dialog/dialog.test.tsx::automatic presentation > renders the bottom sheet at 390px; test:registry/ouro/components/ouro/dialog/dialog.test.tsx::automatic presentation > stays open in the new presentation when a resize crosses 640px, keeping controlled state verify:testExists(registry/ouro/components/ouro/dialog/dialog.test.tsx::automatic presentation > renders the bottom sheet at 390px) verify:testExists(registry/ouro/components/ouro/dialog/dialog.test.tsx::automatic presentation > stays open in the new presentation when a resize crosses 640px, keeping controlled state)
[^button-guards]: test:registry/ouro/components/ouro/button/button.test.tsx::runtime guards > strips %s from the DOM and warns once with the fix; test:registry/ouro/components/ouro/button/button.test.tsx::runtime guards > renders the default look for %s=%j and warns once with the fix; test:registry/ouro/components/ouro/button/button.test.tsx::runtime guards > renders the md size for shadcn's size=%j and warns once with the fix verify:testExists(registry/ouro/components/ouro/button/button.test.tsx::runtime guards > strips %s from the DOM and warns once with the fix) verify:testExists(registry/ouro/components/ouro/button/button.test.tsx::runtime guards > renders the default look for %s=%j and warns once with the fix) verify:testExists(registry/ouro/components/ouro/button/button.test.tsx::runtime guards > renders the md size for shadcn's size=%j and warns once with the fix)
`;

export function Switching(): JSX.Element {
  const example = agentExamples[0]!;
  return (
    <DocsShell current="/docs/switching-from-shadcn/">
      <PageTitle eyebrow="Guide" title="Switching from shadcn" lead={switchingIntro} />
      <Markdown blocks={parse(switchingCoexist)} />
      <CodeBlock code={`${example.code}\n\n${example.devMessage}`} />
    </DocsShell>
  );
}

export function Updating(): JSX.Element {
  return (
    <DocsShell current="/docs/updating/">
      <PageTitle
        eyebrow="Guide"
        title="Updating installed components"
        lead="Ouro HX components are copied into your project, so they're yours to edit. To take an upstream change, compare first, then decide."
      />
      <ol className="m-0 grid list-none gap-12 p-0">
        <li className="grid gap-3">
          <Heading level={2} size="lg">
            1. Review the change
          </Heading>
          <Text>List the files the registry's current version would change:</Text>
          <Command command="npx shadcn@latest add @ouro/sheet --dry-run" />
          <Text>Then see the difference for each of those files by its path:</Text>
          <Command command="npx shadcn@latest add @ouro/sheet --diff src/components/ouro/sheet/sheet.tsx" />
          <Text size="sm" tone="muted">
            Without the namespace, use <InlineCode>{`ourostack/ouro-ui/sheet#${latestRelease}`}</InlineCode> in place of <InlineCode>@ouro/sheet</InlineCode>. A bare{" "}
            <InlineCode>--diff</InlineCode> without a path can stop after the first few unchanged files, before the one you edited.
          </Text>
        </li>
        <li className="grid gap-3">
          <Heading level={2} size="lg">
            2. Overwrite, then reapply your edits
          </Heading>
          <Text>
            The CLI replaces files; it doesn't merge. Commit first, so your edits are safe, then overwrite:
          </Text>
          <Command command="npx shadcn@latest add @ouro/sheet --overwrite" />
          <Command command="git diff" />
          <Text>The diff shows the upstream change and, mixed in, your own edits being removed. Bring back the ones you still want.</Text>
        </li>
        <li className="grid gap-3">
          <Heading level={2} size="lg">
            3. Run the tests that came with it
          </Heading>
          <Text>
            A component's unit tests, stories and end-to-end specs are its optional <InlineCode>-tests</InlineCode> item. If you
            installed them, update them with the component, then run them before you commit:
          </Text>
          <Command command="npx shadcn@latest add @ouro/sheet @ouro/sheet-tests --overwrite" />
          <Text size="sm" tone="muted">
            To add them, run the same command without <InlineCode>--overwrite</InlineCode>. <InlineCode>ouro-tests</InlineCode>{" "}
            {claim("adds every component's tests.", { source: { file: "registry.json" }, verify: { testExists: "scripts/registry.test.mjs::ouro-tests installs every -tests item: the whole suite in one command" } })}
          </Text>
        </li>
        <li className="grid gap-3">
          <Heading level={2} size="lg">
            {claim("Upgrading from v0.1.0", { source: { file: "UPGRADING.md" }, verify: [{ fileLine: "UPGRADING.md", line: 1, pattern: "^# Upgrading from v0\\.1\\.0$" }, { ciJob: "install-upgrade" }] })}
          </Heading>
          {/* UPGRADING.md, the same note as README.md and the release notes; CI runs its commands. */}
          <Markdown blocks={parse(upgrading).slice(1)} />
        </li>
        <li className="grid gap-3">
          <Heading level={2} size="lg">
            Pin a version
          </Heading>
          <Text>
            Add a tag to pin a release, so a later release doesn't change what you install:
          </Text>
          <Command command={`npx shadcn@latest add ourostack/ouro-ui/sheet#${latestRelease}`} />
          <Text size="sm" tone="muted">
            {claim("A release tag pins the item and every Ouro dependency it brings", { source: { file: "scripts/registry.mts" }, verify: { testExists: "scripts/registry.test.mjs::--release pins every same-repo dependency to the release tag and records the version" } })} (such as{" "}
            <InlineCode>button</InlineCode> and the helpers in <InlineCode>lib/ouro</InlineCode>) to the same tag. Any other ref, <InlineCode>#&lt;sha&gt;</InlineCode> or{" "}
            <InlineCode>#&lt;branch&gt;</InlineCode>, pins only the item you name: its Ouro dependencies come from <InlineCode>main</InlineCode>.
            The <InlineCode>@ouro</InlineCode>{" "}
            {claim("namespace serves the newest release,", { source: { file: ".github/workflows/pages.yml" }, verify: { testExists: "scripts/workflows.test.mjs::Pages names GitHub's newest release before it builds, whatever main's package.json says" } })}{" "}
            <InlineCode>{latestRelease}</InlineCode>. Without a ref, the GitHub address installs <InlineCode>main</InlineCode>, which is for contributors and can hold unreleased changes. Releases are listed on{" "}
            <a href={`${GITHUB}/releases`} className="text-primary underline underline-offset-4">GitHub</a>.
          </Text>
        </li>
      </ol>
    </DocsShell>
  );
}

export function NotFound(): JSX.Element {
  return (
    <DocsShell current="">
      <PageTitle eyebrow="404" title="Page not found" lead={<>That page isn't here. The <a href={href("/docs/")} className="text-primary underline underline-offset-4">docs</a> {claim("list every component.", { source: { file: "site/src/site.test.tsx" }, verify: { testExists: "site/src/site.test.tsx::docs > has a page for every registry item at docs/<name>" } })}</>} />
    </DocsShell>
  );
}

/** The component's or the page's entry for a path, if it is one's page. */
function docFor(path: string): { item: DocsItem } | { page: DocsPage } | undefined {
  const route = routeFor(path)?.path;
  const item = docsItems.find((doc) => route === `/docs/${doc.name}/`);
  if (item) return { item };
  const page = docsPages.find((doc) => route === `/docs/${doc.name}/`);
  return page ? { page } : undefined;
}

/** Loads the Markdown a path's page shows, before it renders or hydrates (`loadPage` calls it). */
export async function prepare(path: string): Promise<void> {
  const doc = docFor(path);
  if (doc) await loadMarkdown("item" in doc ? itemFiles(doc.item) : [doc.page.file]);
}

/** The docs module's page for a path: the index, a guide, a component's page, or Not found. */
export default function DocsRoute({ path }: { path: string }): JSX.Element {
  const route = routeFor(path)?.path;
  if (route === "/docs/") return <DocsIndex />;
  if (route === "/docs/switching-from-shadcn/") return <Switching />;
  if (route === "/docs/updating/") return <Updating />;
  const doc = docFor(path);
  if (doc && "item" in doc) return <DocsComponent item={doc.item} />;
  return doc ? <DocsPageView page={doc.page} /> : <NotFound />;
}
