import { claim } from "@/registry/ouro/lib/ouro/claims";

/**
 * "Why you can stop thinking about it", right under the hero (launch copy deck, section 3.2): what a coding agent can't
 * get right alone, what Ouro UI does about it, and five reasons it's safe to stop thinking. The first reason's component
 * counts come from their sources when the site builds (`counts` in virtual:site-proof).
 */
export const WHY = {
  eyebrow: "Why you can stop thinking about it",
  title: claim("Your agent can already write a button. The hard part is everything around it.", {
    source: { file: "docs/guides/agent-interfaces.md" },
    verify: [{ fileLine: "docs/guides/agent-interfaces.md", pattern: "^- Browser driving \\(Playwright, accessibility tree\\): 30 of 30\\.$" }, { fileLine: "docs/guides/agent-interfaces.md", pattern: "^- Plain hand-written MCP tools: 32 of 32\\.$" }],
  }),
  body: [
    "Focus that lands where it should. Touch targets a thumb can hit. Motion that calms down when you ask it to. Contrast you can read. A tool another agent can call without guessing. An agent that doesn't buy groceries nobody approved.",
    claim("Ouro UI does all of that for your agent, on every platform.", {
      source: [
        { test: "test/conformance/interactions.test.tsx::actions at $width px > $id keeps focus in the page and announces each message once after every action" },
        { file: "registry/ouro/lib/ouro/touch-target.tsx" },
        { file: "docs/guides/installing.md" },
        { test: "registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing" },
        { file: "docs/guides/agent-interfaces.md" },
        { file: "docs/platforms/parity.md" },
      ],
      verify: [
        { testExists: "test/conformance/interactions.test.tsx::actions at $width px > $id keeps focus in the page and announces each message once after every action" },
        { fileLine: "registry/ouro/lib/ouro/touch-target.tsx", pattern: "pointer-coarse" },
        { testExists: "scripts/motion-coverage.test.mjs::a motion state with no reduced-motion record for a part fails, even when that part's reduced list is empty" },
        { fileLine: "docs/guides/installing.md", pattern: "with defaults that pass 4\\.5:1 on shadcn's stock themes" },
        { testExists: "registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing" },
        { fileLine: "docs/guides/agent-interfaces.md", pattern: "^- Ouro UI action model \\(generated MCP tools\\): 0 of 32\\.$" },
        { fileLine: "docs/platforms/parity.md", pattern: "." },
      ],
    }),
    claim("Missing a piece? Your agent writes it in the platform's own toolkit, right beside Ouro's, and can offer it back as a pull request, so the next app gets it from the kit.", {
      source: [{ file: "AGENTS.md" }, { file: "docs/platforms/README.md" }],
      verify: [{ fileLine: "AGENTS.md", pattern: "Consumers contribute what they learn back here" }, { fileLine: "docs/platforms/README.md", pattern: "The kits are written in their platforms' own toolkits" }],
    }),
    claim("(At a company, it lands in your own registry first.)", {
      source: { file: "docs/guides/company.md" },
      verify: { fileLine: "docs/guides/company.md", pattern: "Mirror Ouro's registry at a release you have reviewed into a shadcn registry under your own namespace" },
    }),
  ].join(" "),
  credit: claim("Good pieces of this exist, and we borrowed from many of them. Ouro UI puts them in one kit, for people and agents, on the web and native.", {
    source: { file: "AGENTS.md" },
    verify: [{ fileLine: "AGENTS.md", pattern: "give the record a \"Prior art\" section that links each find and marks it adopt, borrow, watch or ignore" }, { fileLine: "docs/platforms/README.md", pattern: "The kits are written in their platforms' own toolkits" }],
  }),
  reasons: {
    native: {
      title: claim("Native on every platform.", {
        source: { spec: "https://github.com/ourostack/ouro-ui-core/blob/5f520a112feb806aa51a8e8bf6a716acdcdf6a54/docs/decisions/2026-11-17-native-kits-no-cross-platform.md" },
        verify: [{ urlOk: "https://github.com/ourostack/ouro-ui-core/blob/5f520a112feb806aa51a8e8bf6a716acdcdf6a54/docs/decisions/2026-11-17-native-kits-no-cross-platform.md" }, { fileLine: "docs/platforms/README.md", pattern: "The kits are written in their platforms' own toolkits" }],
      }),
      lead: claim("React, SwiftUI, WinUI and Compose, each with its own manners. Ouro's components are ordinary views in each toolkit, so they sit inside your own screens:", {
        source: [{ spec: "https://github.com/ourostack/ouro-ui-core/blob/5f520a112feb806aa51a8e8bf6a716acdcdf6a54/docs/decisions/2026-11-17-native-kits-no-cross-platform.md" }, { file: "docs/platforms/README.md" }],
        verify: [{ urlOk: "https://github.com/ourostack/ouro-ui-core/blob/5f520a112feb806aa51a8e8bf6a716acdcdf6a54/docs/decisions/2026-11-17-native-kits-no-cross-platform.md" }, { fileLine: "docs/platforms/README.md", pattern: "The kits are written in their platforms' own toolkits" }],
      }),
      coverage: { label: "the coverage page shows which", href: "/hx/#coverage" },
    },
    people: {
      title: "For people and for agents.",
      line: "Ouro HX for the screens people use, Ouro AX for the doors agents use.",
    },
    yes: {
      title: "One action, your yes.",
      line: claim("Declare an action once: people get a button, agents get a tool, and paying, sending and deleting wait for the person.", {
        source: [{ spec: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L5" }, { spec: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L45" }],
        verify: [{ urlOk: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L5" }, { urlOk: "https://github.com/ourostack/ouro-ui-core/blob/20d06ff7ff7ffb3c50e33add65959608148edcd6/docs/guides/actions.md#L45" }],
      }),
    },
    check: {
      title: "Check, don't squint.",
      line: claim("X-ray, Ouro check and Feel find what's broken, so your agent fixes it before anyone sees it.", {
        source: [{ test: "registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing" }, { test: "scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups" }, { evidence: "site/src/apple/evidence/gatefold-8ce5611-fail.txt" }],
        verify: [
          { testExists: "registry/ouro/ax/xray.test.mts::the kit's example tool conforms, and the X-ray acts on nothing" },
          { testExists: "scripts/check/check.test.mts::Ouro check > finds each rule on its fail page and nothing on any pass page, with a report, a contact sheet and close-ups" },
          { fileLine: "site/src/apple/evidence/gatefold-8ce5611-fail.txt", pattern: "measured: outside=32, poses=3" },
        ],
      }),
    },
    beside: {
      title: "Fits beside what you have.",
      line: claim("MIT. It runs beside your design system, its actions keep your existing MCP tools' names and inputs, and at a company you run your own registry and decide when each release lands.", {
        source: [{ file: "LICENSE" }, { file: "docs/guides/beside-an-incumbent.md" }, { file: "scripts/ouro-actions/ouro-actions.mts" }, { file: "docs/guides/company.md" }],
        verify: [
          { fileLine: "LICENSE", pattern: "^MIT License$" },
          { fileLine: "docs/guides/beside-an-incumbent.md", pattern: "Ouro HX does not ask it to" },
          { fileLine: "scripts/ouro-actions/ouro-actions.mts", pattern: "the MCP and WebMCP tool name" },
          { fileLine: "scripts/ouro-actions/ouro-actions.mts", pattern: "openInput\\?: true;" },
          { fileLine: "docs/guides/company.md", pattern: "one reviewed pull request on the mirror moves the teams that install from it" },
        ],
      }),
      company: { label: "Ouro UI at a company", href: "/docs/company/" },
    },
  },
} as const;
