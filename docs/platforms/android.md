# Ouro HX & AX for Android

Ouro HX and Ouro AX haven't moved in on Android yet, so the room is ready and waiting: Compose for the people, AppFunctions for the agents, and the lights already on. The furniture is sketched in pencil, and the sign on the door says "you, perhaps?"

## What it would be

Ouro HX for Android would be Ouro's look and manners in [Jetpack Compose](https://developer.android.com/compose): Pearl and the other themes as a Compose theme, the press, the spring and the calm under reduced motion, components with the same names as web's, and screens that read well to TalkBack and keep up with a person's font size.

Ouro AX for Android would meet the agent at its Android door, [AppFunctions](https://developer.android.com/ai/appfunctions). Google calls them "the mobile equivalent of tools within the Model Context Protocol (MCP)", and they are experimental, in a preview that may still change.[^appfunctions] An app annotates the functions it offers and describes them in KDoc, and an agent with permission finds and calls them on the device, so the same questions Ouro AX asks a command line apply: is each function named and described well enough to pick, does a failure say what to do next, and does an action other people see ask first?

Since AppFunctions may change, an Ouro AX for Android would start every claim as `should`, as Ouro AX for Apple did.[^apple-should]

## The contract

To become Ouro HX & AX for Android, an implementation should:

1. Take its tokens from a pinned core release. Add a Compose output to core's generators, or generate from core's DTCG files, then record the tag and the file hashes in `core-provenance.json` and check them in CI.
2. Meet Ouro HX's bar. Test for TalkBack names, comfortable touch targets, font scaling, reduced motion and contrast, so a slip fails a build rather than a person. Give an agent with fresh eyes only the package, and check that it builds a correct screen that TalkBack can read.
3. Pass Ouro AX's X-ray for AppFunctions. Write the AppFunctions claims into core's standard, as core did for App Intents, and build an X-ray that checks an app's functions against them.

Read [the guide for platform builders](contributing.md) for the details.

## Propose it

1. Build it wherever you like, in your own repository.
2. Open a pull request to [ourostack/ouro-ui](https://github.com/ourostack/ouro-ui) that adds a link to your work in this page's file, `docs/platforms/android.md`, with a line or two on what it does so far.
3. If Ari likes it, we create `ouro-ui-android`, import your work with its history, and make you a contributor.

[^appfunctions]: https://developer.android.com/ai/appfunctions verify:urlOk(https://developer.android.com/ai/appfunctions)
[^apple-should]: https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/standard/ax/surfaces/apple.md verify:urlOk(https://github.com/ourostack/ouro-ui-core/blob/9f6a0aa65c3e74b2d6b3287bc621c8cd12f66d52/standard/ax/surfaces/apple.md)
