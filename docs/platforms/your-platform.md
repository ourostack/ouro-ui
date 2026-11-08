# Ouro HX & AX for your platform

Ouro HX and Ouro AX can go wherever people and agents meet: a Linux desktop, a game console, a car's dashboard, a watch, a terminal toolkit in Rust, a fridge with opinions. If people use it and agents can reach it, there is a room for Ouro there.

## What it would be

Ouro HX for your platform is Ouro's look and manners in that platform's own toolkit: the themes, the press and the spring, the calm when a person asks for less motion, and components with the same names as web's, so a person moving between your app and an Ouro app on the web feels at home in both.

Ouro AX for your platform finds the doors agents use there, whatever they are called: a command line, an MCP server, an intent system, a screen an agent drives the way a screen reader does. Then it writes down, as checkable claims, what a good host does at those doors, and builds an X-ray that checks them from outside.

## The contract

To become Ouro HX & AX for your platform, an implementation should:

1. Take its tokens from a pinned core release, with a generator in core for the platform's own format and a `core-provenance.json` that CI checks.
2. Meet Ouro HX's bar. Test what a person needs with the platform's own assistive technology in mind. Give an agent with fresh eyes only the package, and check that it builds a correct screen a screen reader can use.
3. Pass Ouro AX's X-ray for its surfaces. Write the doors agents use there into core's standard as claims, and build an X-ray that checks an app against them.

Read [the guide for platform builders](contributing.md) for the details, and for the naming rules a new platform follows.

## Propose it

1. Build it wherever you like, in your own repository.
2. Open a pull request to [ourostack/ouro-ui](https://github.com/ourostack/ouro-ui) that adds `docs/platforms/<platform>.md`, with a link to your work and a line or two on what it does so far. Your file becomes a page in this section.
3. If Ari likes it, we create `ouro-ui-<platform>`, import your work with its history, and make you a contributor.
