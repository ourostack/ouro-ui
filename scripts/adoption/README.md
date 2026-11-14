# The adoption ledger

The one place that tracks who uses Ouro UI and who gives back to it. It is published at <https://ui.ouroboros.bot/adoption/>, regenerated hourly, and its cells link the public source they were measured from. Tracking happens in public, in issues labelled [`adoption`](https://github.com/ourostack/ouro-ui/issues?q=is%3Aissue+label%3Aadoption): one for the program, one per work item.

## Run it

```sh
node scripts/adoption/ledger.mjs                     # writes site/src/adoption/ledger.json
node scripts/adoption/ledger.mjs --out /tmp/l.json   # somewhere else
node scripts/adoption/ledger.mjs --only ouro-md,gatefold
node --test scripts/adoption/ledger.test.mjs         # the tests, with `gh` faked
```

It needs a current Node, `unzip` and a signed-in `gh`, and imports only Node's built-in modules. Code search is rate limited, so a run waits on it between searches.[^search-limit]

The hourly run is [`.github/workflows/adoption-ledger.yml`](../../.github/workflows/adoption-ledger.yml). It writes `ledger.json` to the `adoption-data` branch (a bot-written data branch, not a pull request, so the hour's number does not wait for a pull request to merge). The page paints from the copy built into the site and takes the branch's newer one when it opens. To refresh the copy built into the site, run the command above and commit `site/src/adoption/ledger.json`.

## What it reads

- [`ledger.config.json`](ledger.config.json): the hand-kept list of the [surfaces](scripts/adoption/ledger.config.json "verify:count(scripts/adoption/ledger.config.json#surfaces)=20") and the [work items](scripts/adoption/ledger.config.json "verify:count(scripts/adoption/ledger.config.json#cards)=15"), and how a column is measured for a product. Add a product here, with its repository and a tracking issue.
- Live: GitHub releases, repository files and trees, code search, Actions artifacts, merged pull requests, and the issues labelled `adoption`.

An issue is found by a hidden marker in its body: `<!-- adoption:card=<id> -->` for a work item (the ids are in the config), `<!-- adoption:program -->` for the program. The program issue holds a table, `| Step | Depends on | Repo | State | Evidence |`, which becomes the page's steps. Edit the issue to change a step's state; the next run shows it.

## The columns

A cell is `{ value, note, source, measuredAt }`.[^cell] A value of `null` means "not measured yet" and the note says why. The generator estimates nothing.

| Column | Value | How it is measured |
|---|---|---|
| Ouro UI pin | the pinned tag and how many stable releases came after it | Reads the product's own file (an installed-components record, a `Package.swift` or `Package.resolved`, a workflow's `OURO_UI_TAG`, a vendoring lock) and counts the stable releases of the repository that pin follows published after the pinned one. A vendored commit counts the releases after the commit's date. A product whose file records a dependency on nothing gets an empty list. |
| HX use | `full`, `partial`, `none` or `n/a` | Web: the installed Ouro components (folders of `components/ouro/*/*.tsx` in the repository tree) and the files that import them (code search). `full` is 20 or more[^web-full] components in use, `partial` is some use, and `none` is the absence of both. Apple: the files using an Ouro HX component (`OuroButton`, `OuroToast`, `OuroBanner`, `OuroSheet`, `OuroEmptyState`) and the files that use `OuroHX` in any way. `full` is 5 or more[^apple-full] component files, `partial` is use of `OuroHX` without that, and `none` is neither. `n/a` is for a CLI, a server or a tool that has only a command line or a server, with the reason. |
| AX kit | `yes`, `no` or `n/a` | `yes` when code search finds `defineCommand`, `bindAx` or `ax-mcp` outside the kit's own copy, tests and fixtures, when the product vendors the kit's files, or (Apple) when a file imports `OuroAX`. |
| Actions on the one-action model | a count | `0` until the program's `action-model` step is `done`; after that, `null` until a product's actions are counted.[^action-model] |
| X-ray | claims holding, and `must` claims holding | The latest `ax-xray` report among the product's CI runs: the latest successful runs of the workflows named in the config, their artifacts, `report.json`, matched by the app's name. The cell links the run and gives the report's own date. Only Apple apps have reports. A claim set without `must` claims conforms trivially. |
| Give-back | merged pull requests | Merged pull requests into `ourostack/ouro-ui`, `ouro-ui-core` and `ouro-ui-apple` whose title, text or branch names the product (the terms are in the config; whole words only), leaving out release and "Prepare main" pull requests. It is a text heuristic, and a lower bound: a pull request that came from a product's lane without naming it is not counted, and a mention is not authorship. Ouro UI itself is `n/a`. |
| Tracking issue | the issues for the product's work items | The `adoption` issues whose work item lists the product, with their state. A product that lacks a work item is shown as not having an issue yet. |
| Confirmed | the conditions below, together | The list that follows. |

### Confirmed

A product is confirmed when these hold together:

1. **On current Ouro UI**: it has a pin, and its pins are on the latest release of the repository they follow.
2. **Actions on the one-action model**: its action count is positive.
3. **AX `must` claims pass in CI**: a report exists, it has `must` claims, and they hold. A claim set without `must` claims is vacuous and does not count.[^confirmed]
4. **Has given back**: at least one merged pull request in the give-back column.

Ari then signs the product off; the ledger only says whether the evidence is there. The page counts products "in scope". A product marked `inScope: false` in the config (Hackamore, which is a roadmap item with an empty repository) is listed but not counted.

## The program section

The steps come from the program issue's table. Ouro UI's own numbers are: the latest release of the Ouro UI repositories, the number of Ouro HX components in the registry, the merged pull requests across them, the pull requests the give-back column counted, and the benchmark and the model-reviews result, which are `null` ("not measured yet") until those steps produce one.

## What cannot be measured here

- A product in a private repository: it is listed, with its cells "not measured yet".
- A web product's X-ray: its CI does not run one yet.
- A pin where the product installs Ouro components as source without recording the tag (mendelow.me).
- Code search reads a repository's default branch and can lag a push.

[^search-limit]: scripts/adoption/ledger.mjs verify:fileLine(scripts/adoption/ledger.mjs, /Code search is limited to 10 requests a minute/)
[^cell]: test:scripts/adoption/ledger.test.mjs::the ledger measures every cell, counts confirmed, and leaves unknowns null verify:testExists(scripts/adoption/ledger.test.mjs::the ledger measures every cell, counts confirmed, and leaves unknowns null)
[^confirmed]: test:scripts/adoption/ledger.test.mjs::must claims pass only when a report has must claims and all hold verify:testExists(scripts/adoption/ledger.test.mjs::must claims pass only when a report has must claims and all hold)
[^web-full]: scripts/adoption/ledger.mjs verify:fileLine(scripts/adoption/ledger.mjs, /used >= 20 \? "full"/)
[^apple-full]: scripts/adoption/ledger.mjs verify:fileLine(scripts/adoption/ledger.mjs, /components >= 5 \? "full"/)
[^action-model]: scripts/adoption/ledger.mjs verify:fileLine(scripts/adoption/ledger.mjs, /cell\(ctx, 0, \{ note: "The one-action model is not released yet/)
