# Agent-usability test

This measures Ouro HX's first goal: an agent with no Ouro-specific context builds a correct, accessible screen from the installed code alone.[^goal] Fresh agents build the same five screens three ways, three times each, and a scorer that makes no model calls judges every result the same way.[^protocol]

This file is the runbook for whoever runs the agents (the controller). Nothing here calls a model; you start the agents yourself. The scores are published beside shadcn/ui's, so the rule for every step is that no arm may gain or lose a point for anything but what its agent did.[^fair]

## The arms and the screens

| Arm | What the agent gets |
| --- | --- |
| `shadcn` | A Vite app with every shadcn/ui component (`shadcn add --all`) and shadcn's `llms.txt`.[^arms] |
| `shadcn-skill` | The same, plus shadcn's official skill (`npx skills add shadcn/ui`) in `.claude/skills/`. |
| `ouro` | The same Vite app with every Ouro HX runtime item at a release tag and that tag's `llms.txt`.[^arms] No skill. |

All three start from `test/install-fixture` and `shadcn init --base base --preset nova`, shadcn's own default, so they share one theme, one `@/` alias, one `tsconfig` and one lint config.[^arms]

| Screen | Task |
| --- | --- |
| `settings-form` | An account form whose server errors land on the right field. |
| `recipe-list` | A paged list with swipe rows and an actions menu. |
| `command-palette` | A ⌘K palette with filtering and keyboard control. |
| `confirm-delete` | A destructive confirmation that the server can refuse. |
| `app-shell` | A sidebar shell that folds behind a menu button on phones. |

A screen is a folder in `screens/`: `task.md` is the task the agent reads, and `files/` holds the `src/api/` module that stands in for the backend (`screens/_shared/files` adds the fake backend they share). No task names a library or a component.[^no-library] The screens come from Ouro HX's own catalog plan, and shadcn/ui ships no swipe row; the docs page must say both.[^shadcn-components]

## Run it

Run every command from the repository root, on one machine, with one model for everything. Pick a folder outside every Git repository for the apps, for example `WORK=~/agent-usability`, a date for the run, `DATE=$(date +%F)`, and the model and effort, for example `MODEL=claude-opus-5-5` and `EFFORT=high`.

1. **Create the three arms.** Creating an arm takes a few minutes and needs the network.

   ```bash
   for arm in shadcn shadcn-skill ouro; do scripts/agent-usability/arms/create.sh $arm "$WORK/arms/$arm"; done
   ```

   `OURO_REF=v1.0.0` picks the Ouro HX release (default: `ouro.latestRelease` in `package.json`). The script records what it installed, and what `tsc -b` and the linter already find in the untouched app (the baseline), in `<app>/.agent-usability/arm.json`. Create each arm once: every run of an arm must start from the same app.

2. **Check the scorer against each arm.** A known-good screen built with the arm's own menu must score 100 before any agent runs.[^known-good]

   ```bash
   for arm in shadcn shadcn-skill ouro; do node scripts/agent-usability/preflight.mts "$WORK/arms/$arm" "$WORK/preflight/$arm"; done
   ```

3. **For each arm, each screen and each run 1, 2 and 3, make a workspace.** That is 45 workspaces.[^protocol]

   ```bash
   WORKSPACE="$WORK/$DATE/$arm/$screen/$run"
   node scripts/agent-usability/workspace.mts create "$WORK/arms/$arm" $screen "$WORKSPACE"
   ```

   The workspace is the arm app with the screen's `src/api/` files. It does not hold the arm's record.

4. **Start one fresh agent in each workspace**, with this command and nothing else:

   ```bash
   mkdir -p "$WORK/$DATE/transcripts"
   (cd "$WORKSPACE" && claude -p "$(node "$OLDPWD/scripts/agent-usability/prompt.mts" $arm $screen "$WORKSPACE")" --safe-mode --model "$MODEL" --effort "$EFFORT" --permission-mode bypassPermissions --no-session-persistence --output-format stream-json --verbose) > "$WORK/$DATE/transcripts/$arm-$screen-$run.jsonl"
   ```

   What makes the agent fresh, and the same for every arm:[^protocol]

   - **A new process for every workspace.**[^protocol] Never a subagent of a session that has read this repository: it would inherit that session's instructions, and ours call Ouro HX "ours".
   - **An empty context.** `--safe-mode` turns off user and project instructions (`CLAUDE.md`), skills, plugins, hooks and MCP servers, so the agent has only the prompt and Claude Code's built-in tools.
   - **The workspace is its working folder**, and the workspace is outside every repository.[^protocol]
   - **One model and one effort** for all 45, one `claude` version, and no retries: a run that fails counts as it is.[^protocol]
   - **The same access.** Every agent may read every file in its app and may read the web.[^prompt] The prompt says so in the same words for every arm, because each arm's `llms.txt` is an index of links to web docs.[^prompt]
   - **Don't help.** Don't answer its questions or correct its work.

   The skill arm's skill is in `.claude/skills/`, which safe mode does not load, so that arm's setup line tells the agent to read it. After the run, confirm it did: `grep -c 'skills/shadcn/SKILL.md' "$WORK/$DATE/transcripts/shadcn-skill-$screen-$run.jsonl"` must not be 0.[^skill-check] The skill tells the agent to run `npx shadcn@latest`, which is not pinned (the arm was made with 4.21.1[^arm-cli]), so record which versions ran: `grep -oh 'shadcn@[0-9][0-9.]*' "$WORK/$DATE"/transcripts/shadcn-skill-*.jsonl | sort | uniq -c`. Keep the transcripts; read one before you publish or commit it, because it holds local paths.

5. **Copy what each agent left** into the repository:

   ```bash
   node scripts/agent-usability/workspace.mts collect "$WORK/arms/$arm" $screen "$WORKSPACE" scripts/agent-usability/runs/$DATE $run
   ```

   This copies the app, without `node_modules`, build output, `llms.txt` or the skill, to `runs/$DATE/$arm/$screen/$run/`, and the arm's record, from the arm app the agent never saw, to `runs/$DATE/arms/$arm.json`.[^fair]

6. **Write `scripts/agent-usability/runs/$DATE/run.md`.** The table prints it and fails without the first three lines, and without the skill-arm CLI line when the skill arm has runs:[^run-notes]

   ```markdown
   - Model: <the exact model id>
   - Effort: <the effort>
   - Agent: <`claude --version`>, started with the command in scripts/agent-usability/README.md
   - Web access: yes, for every arm
   - Skill read by every skill-arm agent: <yes, or which runs did not>
   - shadcn CLI the skill-arm agents ran: <every version in the transcripts, or none>
   - Anything that went wrong: <none, or what>
   ```

7. **Score every run, then make the table.**

   ```bash
   node scripts/agent-usability/score-runs.mts $DATE
   node scripts/agent-usability/table.mts scripts/agent-usability/runs/$DATE --write
   ```

   `score-runs.mts` runs `npm ci --ignore-scripts` where a folder has no `node_modules` and writes a run's `score/score.json`, `score/summary.md` and `score/screenshots/` into its folder.[^npm-ci] `score.mts <arm> <screen> <folder> --arm-record runs/$DATE/arms/$arm.json` scores one. `table.mts` prints every run's score and the median per arm and screen, then the pinned versions, and saves it as `runs/$DATE/results.md`.[^table] Commit `runs/$DATE/`. Git ignores the `node_modules` the scorer installed there.

   Publish the scores CI computes, not a laptop's: touch input and font rendering differ between macOS and Linux.

The `Agent usability` workflow (`.github/workflows/agent-usability.yml`) repeats step 7 on the newest committed run, weekly and on demand, and writes the table and every summary to its job summary.[^workflow] It is not a required check and never runs on pull requests.[^workflow] A low score is a result; the workflow fails only when the scorer can't score a run or can't make the table.

## The prompt

Every agent gets the same prompt.[^prompt] Only the first line, the arm's setup line, differs:

- `shadcn`: `Setup: this app uses shadcn/ui. Its components are installed in src/components/ui.`
- `shadcn-skill`: `Setup: this app uses shadcn/ui. Its components are installed in src/components/ui. Before you start, read and follow the shadcn skill in .claude/skills/shadcn/SKILL.md, including the files it links to and the commands it runs.`
- `ouro`: `Setup: this app uses Ouro HX. Its components are installed in src/components/ouro.`

The rest, with the workspace path filled in and the screen's `task.md` appended:

```text
You are a product engineer on a cooking app. Build the screen described below in the app at <workspace>.

- Work only inside <workspace>. The screen is the whole app: render it from `App` in src/App.tsx, and put any new files under src/.
- Build it with the component library the app already has installed. Its docs index is llms.txt in the app root. You may read any file in the app, and you may read the web, for example the pages llms.txt links to.
- src/api/ stands in for the backend. Use it as it is and don't change it.
- Don't add npm packages and don't change the app's configuration: package.json, package-lock.json, components.json, vite.config.ts, .oxlintrc.json and the tsconfig files. The script puts the original configuration back before it judges the app, so changes to it have no effect.
- The app turns on dark mode with the `dark` class on the html element. The screen must work in light and dark mode.
- Before you finish, run `npm run build` and `npm run lint` in <workspace> and fix every error they report.
- When you are done, reply with a short summary of what you built.

A script judges the result, not a person. It checks four things:

- Types: `tsc -b` reports no error. Errors the app already had when you got it don't count against you.
- Lint: `npm run lint` reports no error. Warnings don't count, and neither do errors the app already had.
- Accessibility: the scan named in the task's last acceptance item.
- Behavior: a browser test of the other acceptance items. It finds elements the way a screen reader does, by role, accessible name, label and text, so use the labels and texts the task gives, exactly.

A screen where nothing works scores nothing, however clean its code is. So does one whose app does not build with the original configuration, or whose src/api/ files were changed.
```

`prompt.mts` is the source; `score.test.mjs` fails if this section drifts from it.

## The score

`formula.mts` defines the score and is the only place that documents it: the four parts and their points, the rule that a screen where nothing works scores 0, and what makes a run score 0 outright.[^formula] Read it there. What the scorer needs beyond the formula:

- **Everything it checks is in the prompt or the task.**[^acceptance] The tasks give each requirement in behavior or accessibility terms (`aria-invalid="true"`, a live region, the `menu` role), never as a component.[^no-library] When a check changes, change the task text with it.
- **The baseline.** `arms/create.sh` records what `tsc -b` and oxlint find in an arm before any agent runs. The scorer charges a run only for findings that are not in that record, matched by file, rule and message. In the 2026-10-15 cohort, `shadcn add --all` installed a `scroll-area.tsx` with an unused `React` import, an error under shadcn's own Vite template settings, so both shadcn arms start with one type error that costs them nothing.[^scroll-area] The results table prints each arm's baseline counts.[^baseline-counts]
- **Each arm is checked with the settings it was created with.**[^config-restored] Before it scores a run, the scorer puts the arm's original config files back: `package.json`, the lockfile, `components.json`, `vite.config.ts`, `.oxlintrc.json` (a stock Vite app's config) and the `tsconfig` files. The agent's versions move to `.agent-config/` in the run folder and are listed in the summary. A config edit neither helps nor costs, so loosening `tsconfig` hides no type error, and a package the agent added breaks the build only if the code imports it.[^config-restored] A changed `src/api/` file still scores the run 0, because changing the backend is a different kind of cheating.[^backend]
- **Lint** counts errors only. Warnings are advice.
- **Axe** runs axe-core once per state and scores its WCAG 2 A and AA rules.[^axe] Its best-practice rules, such as `region`, are listed in the summary and cost nothing: a correct menu from either library renders in a portal outside every landmark and would break `region`.[^known-good] It scans the first render and one more state per screen, which each task names.[^no-library] Base UI's focus guards are left out, as in Ouro's own tests.
- **Behavior checks** live in `checks/<screen>.mts`. They find elements by role, accessible name, label and text, so they hold for any library. Each names the acceptance items it proves; a test fails when an item has neither a check nor a note saying what judges it.[^acceptance]
- **The backend stand-in** logs every call on `window.__fakeApi.calls`, which is how the checks see that `deleteCookbook` ran once.[^fake-api]
- **Screenshots are evidence only.** They earn nothing. If a person rates them for the docs page, hide the arm's name first.
- **Freeze the checks before a run.** Don't change a check or a task between the first agent and the last score, and never to fit a component Ouro HX ships later.

`score.test.mjs`, `score-screens.test.mjs`, `score-broken.test.mjs` and `score-minimum.test.mjs` (part of `pnpm test:scripts`, split so CI's script test shards run them side by side) prove the scorer. A known-good version of every screen (`test/screens/`, plain React) scores 100, and so does a recipe list whose menu renders in a portal.[^known-good] Copies with one fault each lose exactly the expected points: a type error, a lint error, an axe violation in every configuration, a contrast failure in dark mode only, a state that can't be reached, a failing behavior on every screen, a build failure, a changed backend file, a screen that does nothing, a one-heading version of every screen, an app shell with only a heading and a skip link, and a broken menu in a portal.[^faults] It also proves that the baseline excuses a library's own errors and nothing else, that a `tsconfig` loosened to hide a type error still loses the type points, also when the scored run is reverted and scored again, and that a harmless config rewrite costs nothing.[^faults]

## What the arms pin, and what they can't

- The shadcn CLI is `shadcn@4.21.1`, the version the install test verifies, the skills CLI is `skills@1.7.0`, and oxlint is this repository's version.
- The skill is pinned to a commit of `shadcn-ui/ui` (`SHADCN_SKILL_REF`). In the 2026-10-15 cohort the pinned command installed two skills, `shadcn` and `migrate-radix-to-base`, in `.claude/skills/`.[^skill-lock]
- Ouro HX comes from a release tag, whose items pin their own dependencies to the same tag.
- shadcn's components and `llms.txt` come from ui.shadcn.com as they are that day, so `arm.json` records the hash of every installed file, the `llms.txt` hash and the installed package versions.[^arm-record] The results table prints them.

## The docs page

The page "Why Ouro HX needs no skill" is not written yet, because it needs real scores.[^page-title] `page.mts` is its hook: today it renders only the results under the title.

[^goal]: scripts/agent-usability/formula.mts verify:fileLine(scripts/agent-usability/formula.mts, /WCAG 2 A and AA/)
[^protocol]: scripts/agent-usability/runs/2026-10-15/protocol.json; scripts/agent-usability/screens.mts verify:count(dir:scripts/agent-usability/runs/2026-10-15/ouro)=5 verify:testExists(scripts/agent-usability/score.test.mjs::the prompt is the same for every arm except its setup line) verify:fileLine(scripts/agent-usability/formula.mts, /runsPerCell = 3/)
[^fair]: scripts/agent-usability/score.test.mjs verify:testExists(scripts/agent-usability/score.test.mjs::an agent pays only for what it did, not for what the app started with)
[^arms]: scripts/agent-usability/arms/create.sh verify:fileLine(scripts/agent-usability/arms/create.sh, /add --all/) verify:fileLine(scripts/agent-usability/arms/create.sh, /^preset=nova$/) verify:testExists(scripts/agent-usability/score.test.mjs::the Ouro arm installs base tokens once before the runtime components)
[^known-good]: scripts/agent-usability/score.test.mjs verify:testExists(scripts/agent-usability/score-screens.test.mjs::a known-good screen scores full marks > recipe-list with a library menu, which renders in a portal outside every landmark: 100)
[^prompt]: scripts/agent-usability/prompt.mts verify:testExists(scripts/agent-usability/score.test.mjs::the prompt is the same for every arm except its setup line) verify:testExists(scripts/agent-usability/score.test.mjs::the README gives the prompt as prompt.mts writes it, and says how to start a fresh agent)
[^skill-check]: scripts/agent-usability/runs/2026-10-15/run.md verify:fileLine(scripts/agent-usability/README.md, /skills\/shadcn\/SKILL\.md/)
[^arm-cli]: evidence:scripts/agent-usability/runs/2026-10-15/arms/shadcn-skill.json verify:equals(scripts/agent-usability/runs/2026-10-15/arms/shadcn-skill.json#shadcnCli)=4.21.1
[^table]: scripts/agent-usability/table.mts verify:testExists(scripts/agent-usability/score.test.mjs::the results table lists every run, the median, the agent and each arm's pinned versions)
[^workflow]: .github/workflows/agent-usability.yml verify:testExists(scripts/agent-usability/score.test.mjs::the workflow scores committed output on demand and weekly, never on pull requests, and fails when the scorer does)
[^formula]: scripts/agent-usability/formula.mts verify:testExists(scripts/agent-usability/score.test.mjs::the formula adds each part's share, and gives nothing when no check that exercises the task passes)
[^acceptance]: scripts/agent-usability/score.test.mjs verify:testExists(scripts/agent-usability/score.test.mjs::every acceptance item of every screen has a behavior check, or says what judges it)
[^no-library]: scripts/agent-usability/score.test.mjs verify:testExists(scripts/agent-usability/score.test.mjs::no screen spec names a library or its components, and each names the scan that judges it)
[^scroll-area]: evidence:scripts/agent-usability/runs/2026-10-15/arms/shadcn.json; evidence:scripts/agent-usability/runs/2026-10-15/arms/shadcn-skill.json verify:fileLine(scripts/agent-usability/runs/2026-10-15/arms/shadcn.json, /scroll-area\.tsx/) verify:fileLine(scripts/agent-usability/runs/2026-10-15/arms/shadcn-skill.json, /scroll-area\.tsx/)
[^backend]: scripts/agent-usability/score.test.mjs verify:testExists(scripts/agent-usability/score-broken.test.mjs::a broken copy of the confirm-delete screen loses exactly the expected points > a changed backend stand-in scores 0, with the reason)
[^axe]: scripts/agent-usability/score.mts verify:fileLine(scripts/agent-usability/score.mts, /const wcagTags = \["wcag2a", "wcag2aa"/)
[^fake-api]: scripts/agent-usability/screens/_shared/files/src/api/fake-backend.ts verify:fileLine(scripts/agent-usability/screens/_shared/files/src/api/fake-backend.ts, /__fakeApi/)
[^faults]: scripts/agent-usability/score.test.mjs verify:testExists(scripts/agent-usability/score-broken.test.mjs::a broken copy of the confirm-delete screen loses exactly the expected points > an axe violation in every configuration loses all the axe points) verify:testExists(scripts/agent-usability/score-minimum.test.mjs::a page that does only the minimum scores 0 on every screen > app-shell with a heading and a skip link) verify:testExists(scripts/agent-usability/score.test.mjs::an agent pays only for what it did, not for what the app started with > a tsconfig loosened to hide a type error still loses the type points, because the original is restored)
[^skill-lock]: evidence:scripts/agent-usability/runs/2026-10-15/arms/shadcn-skill.json verify:fileLine(scripts/agent-usability/runs/2026-10-15/arms/shadcn-skill.json, /"migrate-radix-to-base":/) verify:count(scripts/agent-usability/runs/2026-10-15/arms/shadcn-skill.json#skill.lock.skills)=2
[^arm-record]: scripts/agent-usability/arms/create.sh; evidence:scripts/agent-usability/runs/2026-10-15/arms/shadcn.json verify:fileLine(scripts/agent-usability/runs/2026-10-15/arms/shadcn.json, /"llmsTxt"/)
[^shadcn-components]: https://ui.shadcn.com/docs/components verify:urlOk(https://ui.shadcn.com/docs/components)
[^run-notes]: scripts/agent-usability/table.mts verify:fileLine(scripts/agent-usability/table.mts, /\["Model", "Effort", "Agent", \.\.\.\(skillRan \? \["shadcn CLI the skill-arm agents ran"\]/)
[^baseline-counts]: scripts/agent-usability/table.mts verify:fileLine(scripts/agent-usability/table.mts, /Type errors before the agent ran/) verify:fileLine(scripts/agent-usability/table.mts, /Lint errors before the agent ran/)
[^config-restored]: test:scripts/agent-usability/score.test.mjs::an agent pays only for what it did, not for what the app started with > a tsconfig loosened to hide a type error still loses the type points, because the original is restored; test:scripts/agent-usability/score.test.mjs::an agent pays only for what it did, not for what the app started with > a harmless config rewrite and an added config file cost nothing verify:testExists(scripts/agent-usability/score.test.mjs::an agent pays only for what it did, not for what the app started with > a tsconfig loosened to hide a type error still loses the type points, because the original is restored) verify:testExists(scripts/agent-usability/score.test.mjs::an agent pays only for what it did, not for what the app started with > a harmless config rewrite and an added config file cost nothing)
[^page-title]: scripts/agent-usability/page.mts verify:fileLine(scripts/agent-usability/page.mts, /# Why Ouro HX needs no skill/)
[^npm-ci]: scripts/agent-usability/score.mts verify:fileLine(scripts/agent-usability/score.mts, /\["ci", "--ignore-scripts"/)
