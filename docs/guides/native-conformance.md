# Shared cases across the kits

Ouro UI draws the same agent-built card on the web and on the native kits. This page says how that is checked, so you can judge whether the implementations stay the same behaviour.

## What is shared

Core holds a set of A2UI conformance cases: JSON files that say, for the messages an agent sends, what the card must become. The web, Apple, Windows and Android kits carry the same case files, pinned by checksum to a core tag, so a kit cannot edit a case to pass. The native kits record the pin in `core-provenance.json`; web records it in `test/fixtures/a2ui/core.json`.[^apple][^windows][^android][^web]

## What runs them

The kits run the cases with their own code, on their own toolchains, in their own CI: web in Vitest, Apple in Swift Testing, Windows in .NET tests and Android in JUnit.[^runners] A case is data, so a kit passes the case or it does not.

## What is not shared

- The cases cover the card's behaviour: its tree, its bindings, its updates, its confirmation names and the messages an agent may not send. They say nothing about how a kit draws, so a screenshot of one is not a check of another.
- The native kits' tests run in the kits' own repositories, not in this one.[^ci]
- A passing case is a claim about the core tag the kit pins. A newer core tag needs the kit to re-vendor first.
- A combined run of one shared behaviour test across the kits is not published yet, so this page shows shared cases, not a cross-kit result.

## Where to look next

[Platforms](../platforms/README.md) says what the kits do today.

[^apple]: https://github.com/ourostack/ouro-ui-apple/blob/8a01ed114ffbd85ff8ae37e8d8c0dc8a717d5e86/core-provenance.json verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/8a01ed114ffbd85ff8ae37e8d8c0dc8a717d5e86/core-provenance.json)
[^windows]: https://github.com/ourostack/ouro-ui-windows/blob/5adcd329bc0ed4b0cdebd1e2dc10a77404b9682f/core-provenance.json verify:urlOk(https://github.com/ourostack/ouro-ui-windows/blob/5adcd329bc0ed4b0cdebd1e2dc10a77404b9682f/core-provenance.json)
[^android]: https://github.com/ourostack/ouro-ui-android/blob/78e4e5fd72aac5235ed9bff4653a68516728a5ca/core-provenance.json verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/78e4e5fd72aac5235ed9bff4653a68516728a5ca/core-provenance.json)
[^web]: test/fixtures/a2ui/core.json verify:fileLine(test/a2ui.test.ts, /every case core pinned is here/)
[^runners]: https://github.com/ourostack/ouro-ui-apple/blob/8a01ed114ffbd85ff8ae37e8d8c0dc8a717d5e86/Tests/OuroA2UITests/ConformanceTests.swift; https://github.com/ourostack/ouro-ui-windows/blob/5adcd329bc0ed4b0cdebd1e2dc10a77404b9682f/tests/Ouro.Tests/A2UITests.cs; https://github.com/ourostack/ouro-ui-android/blob/78e4e5fd72aac5235ed9bff4653a68516728a5ca/ouro-hx/src/test/kotlin/bot/ouro/ui/hx/composed/A2UITest.kt verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/8a01ed114ffbd85ff8ae37e8d8c0dc8a717d5e86/Tests/OuroA2UITests/ConformanceTests.swift) verify:urlOk(https://github.com/ourostack/ouro-ui-windows/blob/5adcd329bc0ed4b0cdebd1e2dc10a77404b9682f/tests/Ouro.Tests/A2UITests.cs) verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/78e4e5fd72aac5235ed9bff4653a68516728a5ca/ouro-hx/src/test/kotlin/bot/ouro/ui/hx/composed/A2UITest.kt) verify:fileLine(test/a2ui.test.ts, /A2UI conformance/)
[^ci]: https://github.com/ourostack/ouro-ui-apple/blob/8a01ed114ffbd85ff8ae37e8d8c0dc8a717d5e86/.github/workflows/ci.yml; https://github.com/ourostack/ouro-ui-windows/blob/5adcd329bc0ed4b0cdebd1e2dc10a77404b9682f/.github/workflows/ci.yml; https://github.com/ourostack/ouro-ui-android/blob/78e4e5fd72aac5235ed9bff4653a68516728a5ca/.github/workflows/ci.yml verify:urlOk(https://github.com/ourostack/ouro-ui-apple/blob/8a01ed114ffbd85ff8ae37e8d8c0dc8a717d5e86/.github/workflows/ci.yml) verify:urlOk(https://github.com/ourostack/ouro-ui-windows/blob/5adcd329bc0ed4b0cdebd1e2dc10a77404b9682f/.github/workflows/ci.yml) verify:urlOk(https://github.com/ourostack/ouro-ui-android/blob/78e4e5fd72aac5235ed9bff4653a68516728a5ca/.github/workflows/ci.yml)
