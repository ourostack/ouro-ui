# A guide for platform builders

This is the packing list for taking Ouro HX and Ouro AX somewhere new (splendid, by the way): what an implementation must do, how to name what you build, and how your work becomes part of Ouro.

## The contract

### 1. Tokens from a pinned core release

[Ouro UI core](https://github.com/ourostack/ouro-ui-core) holds the tokens once, as DTCG JSON, and generates web's stylesheets and Apple's Swift from them.[^core] A platform takes those files from a release tag, not from a branch, and records the tag and the hash of each file in `core-provenance.json` at its root.[^pinning] Its CI hashes the files and fails when one differs, so a token changes only in a pull request that moves the tag.[^pinning]

For a new platform, add a generator for its format to core, beside the web and Apple ones, or start by reading the DTCG files yourself and propose the generator later.

### 2. Ouro HX's bar

- Test what a person needs. Make sure, in tests, that the platform's screen reader names every control, that focus shows, that touch targets are comfortable, that text scales, and that nothing moves when a person asks for less motion. Write them as tests that fail a build, the way [web's conformance matrix](../guides/conformance.md) and Apple's audits do.
- Check that an agent can use it. Give an agent with fresh eyes only the package, and check that it builds a correct screen that a screen reader can use. Do it the way web does ([how](../guides/why-no-skill.md)), with fresh agents and a scorer that calls no model, and commit the runs.
- Keep web's names. Call a component what web calls it (`Button`, `EmptyState`, `Sheet`), so people and agents can carry what they know across.

### 3. Ouro AX's X-ray for your surfaces

Ouro AX's standard is a list of claims: rules a program can check from outside an app ([the claims](../guides/ax-standard.md)). For a new platform:

1. List the surfaces agents use there.
2. Write their claims into core's standard as data, with a source, a check and a fix for each. Start them as `should`; a claim becomes `must` only when an evaluation shows agents failing without it, or when it guards against a stated hazard.[^admission]
3. Build an X-ray that checks an app against them and says which check proved which claim. Keep a checker that needs the platform's own tools with the platform; one that works over a protocol, such as MCP, already lives with Ouro AX for web ([the X-ray](../guides/ax-conformance.md)).

## Naming

- Keep the products' names. Call them Ouro HX and Ouro AX on any platform, and put a platform's name after "for", in smaller type: "Ouro HX for Android", not "Android HX". Platform names are other companies' trademarks, and this keeps them pointing at where the products run.[^trademark]
- Name a platform by its ecosystem, not its toolkit: Android, not Compose. Put toolkits in the description, so a change of toolkit renames nothing.
- Call the repository `ouro-ui-<platform>`, and keep the platform out of code names: `OuroHX`, not `OuroHXAndroid`.

## From a pull request to a repository

1. Build it in your own repository, in the open, with its history.
2. Open a pull request to [ourostack/ouro-ui](https://github.com/ourostack/ouro-ui) that adds `docs/platforms/<platform>.md` with a link to your work and a line or two on where it stands. For Android or Windows, add your link to the page that is already there. Give each factual sentence a source, and run `pnpm claims:lint docs/platforms/<platform>.md` first ([claims](../guides/claims.md)).
3. If Ari likes it, we create `ouro-ui-<platform>`, import your work with its history, and make you a contributor. Then the version table on [the Platforms page](README.md) gets a new row.

[^core]: https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/README.md#whats-inside verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/README.md#whats-inside)
[^pinning]: https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/README.md#pinning-a-core-release verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/README.md#pinning-a-core-release)
[^admission]: test:registry/ouro/ax/claims.test.mts::the claim set follows its own admission rule: every must claim cites a run or states a hazard verify:testExists(registry/ouro/ax/claims.test.mts::the claim set follows its own admission rule: every must claim cites a run or states a hazard)
[^trademark]: https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html verify:urlOk(https://www.apple.com/legal/intellectual-property/guidelinesfor3rdparties.html)
