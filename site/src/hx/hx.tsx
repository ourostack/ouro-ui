import { useEffect, useState, type JSX, type ReactNode } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Hero } from "@/registry/ouro/components/ouro/hero/hero";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { Table } from "@/registry/ouro/components/ouro/table/table";
import { Tabs } from "@/registry/ouro/components/ouro/tabs/tabs";
import { claim } from "@/registry/ouro/lib/ouro/claims";
import { StoryOpener } from "../components/story-world";
import { href } from "../paths";
import { Agents } from "../voyage/home-reference";
import { Container } from "../voyage/layout";
import kits from "../platforms/kits.json";
import { Band, Capture } from "../platforms/shell";
import { coverage, PLATFORMS, type CoverageRow, type Platform } from "./coverage";



const counts = coverage.counts;

/** Each platform's tab: its lede (the deck's, section 3.3) and its ways in. */
const PANELS: Record<Platform, { label: string; body: ReactNode; links: Array<{ label: string; href: string; quiet?: boolean }> }> = {
  web: {
    label: "Web",
    body: (
      <>
        <p>
          {counts.web}{" "}
          {claim("React components on Base UI and Tailwind, copied into your app from a shadcn registry, so the source is yours to read and change.", {
            source: [{ file: "docs/platforms/parity.md" }, { file: "package.json" }],
            verify: [{ testExists: "scripts/parity-matrix.test.mjs::the parity page shows what its data renders" }, { fileLine: "package.json", pattern: "\"@base-ui/react\"" }, { fileLine: "docs/platforms/parity.md", pattern: "Components: Web has \\d+ of \\d+" }],
          })}{" "}
          Your app&rsquo;s own Tailwind compiles them, and your theme paints them.
        </p>
        <p className="apple-fine">
          {claim("Every story passes axe, the accessibility checker, at a phone's width and a laptop's.", {
            source: { test: "test/stories.test.tsx::at $width px > %s > $id has no axe violations, closed and with each overlay open" },
            verify: { testExists: "test/stories.test.tsx::at $width px > %s > $id has no axe violations, closed and with each overlay open" },
          })}
        </p>
      </>
    ),
    links: [
      { label: "Hand it to your agent", href: "/docs/agent-quickstart/" },
      { label: "Browse the components", href: "/docs/", quiet: true },
    ],
  },
  apple: {
    label: "Apple",
    body: (
      <>
        <p>
          {claim("20 SwiftUI components and App Intents Siri can call, from the same declaration.", {
            source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/84512c1d678dce337513fcdd975ed76a583c888d/README.md" },
            verify: [
              { count: "site/src/apple/kit.json#components", is: 20 },
              { fileLine: "site/src/platforms/kits.json", pattern: "an App Intent, a SwiftUI button and a Reins action" },
            ],
          })}{" "}
          One Swift package for iPhone, iPad and Mac.{" "}
          {claim("Every component keeps 44-point targets, has VoiceOver names, wraps at the largest text sizes and calms down under Reduce Motion, and VoiceOver reads the gallery in CI.", { source: { spec: "https://github.com/ourostack/ouro-ui-apple/blob/84512c1d678dce337513fcdd975ed76a583c888d/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "Every component keeps 44-point targets, crossfades under Reduce Motion, has VoiceOver names, wraps at the largest" }, { fileLine: "site/src/platforms/kits.json", pattern: "has VoiceOver read every page of the gallery" }] })}
        </p>
        <p>They&rsquo;re plain SwiftUI views, so they sit in your own stacks and lists, beside anything you write yourself.</p>
      </>
    ),
    links: [
      { label: "Ouro UI for Apple", href: "/apple/" },
      { label: "Add the package", href: "/apple/start/", quiet: true },
    ],
  },
  windows: {
    label: "Windows",
    body: (
      <>
        <p>
          {claim("26 components in WinUI 3, and App Actions and MCP for agents, from the same declaration.", {
            source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" },
            verify: [{ count: "site/src/platforms/kits.json#windows.components", is: 26 }, { fileLine: "site/src/platforms/kits.json", pattern: "all generated from ouro-ui-core's one defineAction declaration" }],
          })}{" "}
          {claim("Every pull request reads each one through UI Automation, has NVDA read the tables, and presses an agent's card as a person would.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/blob/65dc6dce47d3e7e8f77164f63e617b9ee3e1b773/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "reads the window through UI Automation" }, { fileLine: "site/src/platforms/kits.json", pattern: "starts NVDA through Guidepup" }, { fileLine: "site/src/platforms/kits.json", pattern: "presses it as a person would" }] })}
        </p>
        <p>They&rsquo;re WinUI controls, so they sit in your own XAML beside anything you write yourself.</p>
      </>
    ),
    links: [
      { label: "Ouro UI for Windows", href: "/windows/" },
      { label: "Add the package", href: "/windows/start/", quiet: true },
    ],
  },
  android: {
    label: "Android",
    body: (
      <>
        <p>
          {claim("26 components in Jetpack Compose, and AppFunctions for agents, from the same declaration.", {
            source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" },
            verify: [{ count: "site/src/platforms/kits.json#android.components", is: 26 }, { fileLine: "site/src/platforms/kits.json", pattern: "AppFunctions for agents, both from ouro-ui-core's one defineAction declaration" }],
          })}{" "}
          {claim("Every pull request checks what a screen reader hears, 48 dp touch targets, 200% text and contrast, and calls the AppFunctions on an Android emulator.", { source: { spec: "https://github.com/ourostack/ouro-ui-android/blob/1f47ebe626806473f8c2c971d3e91da32b641dc5/README.md" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "names and roles in the semantics tree, 48 dp touch targets, reduced motion, text that reflows at 200%, and contrast" }, { fileLine: "site/src/platforms/kits.json", pattern: "the sample on an Android 17 emulator" }] })}
        </p>
        <p>They&rsquo;re composables, so they sit in your own screens beside anything you write yourself.</p>
      </>
    ),
    links: [
      { label: "Ouro UI for Android", href: "/android/" },
      { label: "Add the library", href: "/android/start/", quiet: true },
    ],
  },
};

/** The platform tabs: /hx/#web, #apple, #windows or #android opens that tab and scrolls to it. */
function PlatformTabs(): JSX.Element {
  const [value, setValue] = useState<Platform>("web");
  useEffect(() => {
    const fromHash = () => {
      const wanted = window.location.hash.slice(1);
      if ((PLATFORMS as readonly string[]).includes(wanted)) {
        setValue(wanted as Platform);
        requestAnimationFrame(() => document.getElementById("platforms")?.scrollIntoView({ block: "start" }));
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  return (
    <Tabs
      label="Platforms"
      value={value}
      onValueChange={(next) => {
        setValue(next as Platform);
        history.replaceState(null, "", `#${next}`);
      }}
      items={PLATFORMS.map((platform) => ({
        value: platform,
        label: PANELS[platform].label,
        content: (
          <div className="hx-panel">
            {PANELS[platform].body}
            <div className="apple-actions">
              {PANELS[platform].links.map((link) =>
                link.quiet ? (
                  <Button key={link.href} href={href(link.href)} variant="outline" tone="secondary">
                    {link.label}
                  </Button>
                ) : (
                  <Button key={link.href} href={href(link.href)}>
                    {link.label}
                  </Button>
                ),
              )}
            </div>
          </div>
        ),
      }))}
    />
  );
}

const TONES = [
  { tone: "primary", label: "Primary" },
  { tone: "secondary", label: "Secondary" },
  { tone: "destructive", label: "Destructive" },
] as const;

/** One button, four platforms: the web's, pressed live, beside the same three tones from each native kit's CI. */
function OneButton(): JSX.Element {
  const [pressed, setPressed] = useState<string | null>(null);
  return (
    <ul className="hx-four">
      <li>
        <p className="hx-four-kicker">Web, live: press one</p>
        <div className="hx-four-live">
          {TONES.map(({ tone, label }) => (
            <Button key={tone} tone={tone} onClick={() => setPressed(label)}>
              {label}
            </Button>
          ))}
        </div>
        <p className="hx-four-said" aria-live="polite">
          {pressed ? `${pressed} pressed. Same tokens as the three beside it.` : "\u00a0"}
        </p>
      </li>
      <li>
        <p className="hx-four-kicker">Apple, SwiftUI</p>
        <Capture
          light="/hx/one-button/apple-light.webp"
          dark="/hx/one-button/apple-dark.webp"
          alt="OuroButton on macOS: a primary Save recipe button, soft and outline buttons, and a destructive Delete."
          note="From the kit's snapshot test on macOS."
          source={kits.oneButton.apple}
          width={780}
          height={296}
        />
      </li>
      <li>
        <p className="hx-four-kicker">Windows, WinUI</p>
        <Capture
          light="/hx/one-button/windows.webp"
          dark="/hx/one-button/windows.webp"
          alt="OuroButton on Windows: primary, secondary and destructive solid buttons, with large text."
          note={claim("From the windows job's capture with text at 225%.", { source: { spec: "https://github.com/ourostack/ouro-ui-windows/actions/runs/44879217887" }, verify: [{ fileLine: "site/src/platforms/kits.json", pattern: "with animations off and with text at 225%" }] })}
          source={kits.oneButton.windows}
          width={690}
          height={66}
        />
      </li>
      <li>
        <p className="hx-four-kicker">Android, Compose</p>
        <Capture
          light="/hx/one-button/android-light.webp"
          dark="/hx/one-button/android-dark.webp"
          alt="OuroButton on Android: Primary, Secondary and Destructive solid buttons."
          note="From the emulator job's capture."
          source={kits.oneButton.android}
          width={880}
          height={142}
        />
      </li>
    </ul>
  );
}

const cell = (name: string | null) => (name ? <span className="hx-cell-name">{name}</span> : <span className="hx-cell-none">Not yet</span>);

/** What each platform has today, component by component, from the parity matrix. */
function Coverage(): JSX.Element {
  const [all, setAll] = useState(false);
  const rows = all ? coverage.rows : coverage.rows.filter((row) => row.apple || row.android || row.windows);
  return (
    <>
      <ul className="hx-counts">
        {PLATFORMS.map((platform) => (
          <li key={platform}>
            <span className="hx-count">{counts[platform]}</span>
            <span className="hx-count-label">on {PANELS[platform].label === "Web" ? "the web" : PANELS[platform].label}</span>
          </li>
        ))}
      </ul>
      <p className="platform-footnote">
        {claim("Counted from the parity matrix, which counts every control a kit exports: the agent's card surface too, and on Windows three buttons web draws inside other components.", {
          source: { file: "docs/platforms/parity.md" },
          verify: [{ testExists: "scripts/parity-matrix.test.mjs::the parity page shows what its data renders" }, { fileLine: "docs/platforms/parity.md", pattern: "`OuroNavButton`" }],
        })}
      </p>
      <div className="hx-coverage-controls">
        <Switch label={`Show all ${coverage.rows.length}, web-only ones too`} checked={all} onCheckedChange={setAll} />
      </div>
      <Table<CoverageRow>
        caption={all ? "The whole matrix, by platform" : "Components a native kit has, by platform"}
        columns={[
          { key: "name", header: "Component", cell: (row) => row.name },
          { key: "web", header: "Web", cell: (row) => cell(row.web) },
          { key: "apple", header: "Apple", cell: (row) => cell(row.apple) },
          { key: "windows", header: "Windows", cell: (row) => cell(row.windows) },
          { key: "android", header: "Android", cell: (row) => cell(row.android) },
        ]}
        rows={rows}
        rowKey="name"
        rowHref={(row) => (row.web ? href(`/docs/${row.web}/`) : undefined)}
        dense
      />
    </>
  );
}

/** /hx/: Ouro HX on every platform, the same button on four, what each platform has, and how agents read the types. */
export default function HxPage(): JSX.Element {
  return (
    <div id="hx" className="apple">
      <StoryOpener scene="ouro-hx" line="One glass button on a cabin deck. Press it here, then watch three other platforms press back." />
      <Hero
        layout="column"
        eyebrow="Components"
        title={"Ouro HX, for people's\u00a0screens."}
        description={
          <p>
            {claim("Components for people's screens, built by your agent: focus, touch targets, motion, contrast and screen readers handled, in React, SwiftUI, WinUI and Compose.", {
              source: { file: "docs/platforms/parity.md" },
              verify: [
                { testExists: "scripts/parity-matrix.test.mjs::the parity page shows what its data renders" },
                { fileLine: "docs/platforms/parity.md", pattern: "\\| `target\\.touch` \\| must \\| component \\| Partly \\| Covered \\| Covered \\| Covered \\|" },
                { fileLine: "docs/platforms/parity.md", pattern: "\\| `motion\\.reduced` \\| must \\| component \\| Partly \\| Covered \\| Covered \\| Covered \\|" },
                { fileLine: "docs/platforms/parity.md", pattern: "\\| `name\\.spoken` \\| must \\| component \\| Partly \\| Covered \\| Covered \\| Covered \\|" },
              ],
            })}
          </p>
        }
        actions={
          <>
            <Button href={href("/docs/agent-quickstart/")}>Hand it to your agent</Button>
            <Button href={href("/hx/#coverage")} variant="outline" tone="secondary">
              Coverage by platform
            </Button>
          </>
        }
      />

      <Band id="platforms" eyebrow="Four platforms" title="Native where it lands, with the local manners.">
        <PlatformTabs />
      </Band>

      <Band
        id="one-button"
        eyebrow="One button, four platforms"
        title="Press it here. They pressed it there."
        lede={
          <p>
            {claim("The same three tones, from the same tokens, in four toolkits. The web's is live; the others are pictures from each kit's own CI.", {
              source: [{ file: "site/src/platforms/kits.json" }, { file: "scripts/parity-data/parity.json" }],
              verify: [
                { fileLine: "scripts/parity-data/parity.json", pattern: "tokens:parity compares each generated file with web's file at webTag, byte for byte" },
                { fileLine: "site/src/platforms/kits.json", pattern: "actions/runs/44879217887" },
                { fileLine: "docs/platforms/parity.md", pattern: "\\| \\[button\\]\\(https://ui\\.ouroboros\\.bot/docs/button/\\) \\| `button` \\| `OuroButton` \\| `OuroButton` \\| `OuroButton` \\|" },
              ],
            })}
          </p>
        }
      >
        <OneButton />
      </Band>

      <Band
        id="coverage"
        eyebrow="Coverage"
        title="Who has what, today."
        lede={
          <p>
            {claim("Every component on every platform, from the parity matrix, which is rebuilt from each kit's newest release whenever this site is published.", {
              source: [{ file: "docs/platforms/parity.md" }, { file: ".github/workflows/pages.yml" }],
              verify: [{ testExists: "scripts/parity-matrix.test.mjs::the parity page shows what its data renders" }, { testExists: "scripts/workflows.test.mjs::Pages writes the other kits' newest releases into the parity matrix before it builds, and keeps main's copy when GitHub cannot be read" }],
            })}{" "}
            Missing one? Your agent writes it in the platform&rsquo;s own toolkit, beside Ouro&rsquo;s, and can offer it back.
          </p>
        }
      >
        <Coverage />
      </Band>

      <Agents />

      <Container className="apple-soon">
        <p className="apple-fine">
          Ouro HX is half of Ouro UI. The other half, Ouro AX, is the doors agents use instead of a screen.{" "}
          <a className="apple-inline-link" href={href("/ax/")}>
            Meet Ouro AX
          </a>
          .
        </p>
      </Container>
    </div>
  );
}
