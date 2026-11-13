# The adoption ledger

The one place that tracks who uses Ouro UI and who gives back to it. It is published at <https://ui.ouroboros.bot/adoption/>, regenerated every hour, and every cell links the public source it was measured from. Tracking happens in public, in issues labelled [`adoption`](https://github.com/ourostack/ouro-ui/issues?q=is%3Aissue+label%3Aadoption): one for the program, one per work item.

## Run it

```sh
node scripts/adoption/ledger.mjs                     # writes site/src/adoption/ledger.json
node scripts/adoption/ledger.mjs --out /tmp/l.json   # somewhere else
node scripts/adoption/ledger.mjs --only ouro-md,gatefold
node --test scripts/adoption/ledger.test.mjs         # the tests, with `gh` faked
```

It needs Node 22 or later, `unzip` and a signed-in `gh`, and no other dependencies. A full run takes about four minutes, because code search allows ten requests a minute.

The hourly run is [`.github/workflows/adoption-ledger.yml`](../../.github/workflows/adoption-ledger.yml). It writes `ledger.json` to the `adoption-data` branch (a bot-written data branch, not a pull request, so the hour's number never waits in the merge queue). The page paints from the copy built into the site and takes the branch's newer one when it opens. To refresh the copy built into the site, run the command above and commit `site/src/adoption/ledger.json`.

## What it reads

- [`ledger.config.json`](ledger.config.json): the hand-kept list of the 20 products and surfaces and the 15 work items, and how each column is measured for each. Add a product here, with its repository and a tracking issue.
- Live: GitHub releases, repository files and trees, code search, Actions artifacts, merged pull requests, and the issues labelled `adoption`.

An issue is found by a hidden marker in its body: `<!-- adoption:card=<id> -->` for a work item (the ids are in the config), `<!-- adoption:program -->` for the program. The program issue holds a table, `| Step | Depends on | Repo | State | Evidence |`, which becomes the page's steps. Edit the issue to change a step's state; the next run shows it.

## The columns

Every cell is `{ value, note, source, measuredAt }`. A value of `null` means "not measured yet" and the note says why. Nothing is estimated.

| Column | Value | How it is measured |
|---|---|---|
| Ouro UI pin | the pinned tag and how many stable releases came after it | Reads the product's own file (an installed-components record, a `Package.swift` or `Package.resolved`, a workflow's `OURO_UI_TAG`, a vendoring lock) and counts the stable releases of the repository that pin follows published after the pinned one. A vendored commit counts the releases after the commit's date. No dependency found is an empty list. |
| HX use | `full`, `partial`, `none` or `n/a` | Web: the installed Ouro components (folders of `components/ouro/*/*.tsx` in the repository tree) and the files that import them (code search). `full` is 20 or more components in use, `partial` is any, `none` is none. Apple: the files using an Ouro HX component (`OuroButton`, `OuroToast`, `OuroBanner`, `OuroSheet`, `OuroEmptyState`) and the files using `OuroHX` at all. `full` is 5 or more component files, `partial` is any use of `OuroHX`, `none` is neither. `n/a` is for a CLI, a server or a tool with no screen of its own, with the reason. |
| AX kit | `yes`, `no` or `n/a` | `yes` when code search finds `defineCommand`, `bindAx` or `ax-mcp` outside the kit's own copy, tests and fixtures, when the product vendors the kit's files, or (Apple) when a file imports `OuroAX`. |
| Actions on the one-action model | a count | 0 until the program's `action-model` step is `done`; after that, `null` until each product's actions are counted. |
| X-ray | claims holding, and `must` claims holding | The newest `ax-xray` report among the product's CI runs: the latest successful runs of the workflows named in the config, their artifacts, `report.json`, matched by the app's name. The cell links the run and gives the report's own date. Only Apple apps have reports. A claim set with no `must` claims conforms trivially. |
| Give-back | merged pull requests | Merged pull requests into `ourostack/ouro-ui`, `ouro-ui-core` and `ouro-ui-apple` whose title, text or branch names the product (the terms are in the config; whole words only), leaving out release and "Prepare main" pull requests. It is a text heuristic, and a lower bound: a pull request that came from a product's lane without naming it is not counted, and a mention is not authorship. Ouro UI itself is `n/a`. |
| Tracking issue | the issues for the product's work items | The `adoption` issues whose work item lists the product, with their state. A product with none says "no issue yet". |
| Confirmed | all four conditions | The next four. |

### Confirmed

A product is confirmed when all four hold:

1. **On current Ouro UI**: it has at least one pin, and every pin is on its repository's latest release.
2. **Actions on the one-action model**: its action count is above 0.
3. **AX `must` claims pass in CI**: a report exists, it has `must` claims, and every one holds. A claim set with none is vacuous and does not count.
4. **Has given back**: at least one merged pull request in the give-back column.

Ari then signs the product off; the ledger only says whether the evidence is there. The page counts products "in scope". A product marked `inScope: false` in the config (Hackamore, which is a roadmap item with an empty repository) is listed but not counted.

## The program section

The steps come from the program issue's table. Ouro UI's own numbers are: the latest release of each of the three repositories, the number of Ouro HX components in the registry, the merged pull requests across the three repositories, the pull requests the give-back column counted, and the benchmark and the model-reviews result, which are `null` ("not measured yet") until those steps produce one.

## What cannot be measured here

- A product in a private repository: it is listed, with every cell "not measured yet".
- A web product's X-ray: none runs in CI yet.
- A pin where the product installs Ouro components as source without recording the tag (mendelow.me).
- Code search reads each repository's default branch and can lag a push by minutes.
