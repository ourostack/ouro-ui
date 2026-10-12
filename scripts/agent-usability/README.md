# Agent-usability test

This measures Ouro HX's first goal: an agent with no Ouro-specific context builds a correct, accessible screen from the installed code alone. Fresh agents build the same five screens three ways, and a scorer that makes no model calls judges every result the same way.

This file is the runbook for whoever runs the agents (the controller). Nothing here calls a model; you dispatch the agents yourself.

## The arms and the screens

| Arm | What the agent gets |
| --- | --- |
| `shadcn` | A Vite app with every shadcn/ui component (`shadcn add --all`) and shadcn's `llms.txt`. |
| `shadcn-skill` | The same, plus shadcn's official skill (`npx skills add shadcn/ui`) in `.claude/skills/`. |
| `ouro` | The same Vite app with every Ouro HX runtime item at a release tag and that tag's `llms.txt`. No skill. |

All three start from `test/install-fixture` and `shadcn init --base base --preset nova`, so they share one theme.

| Screen | Task |
| --- | --- |
| `settings-form` | An account form whose server errors land on the right field. |
| `recipe-list` | A paged list with swipe rows and an actions menu. |
| `command-palette` | A ⌘K palette with filtering and keyboard control. |
| `confirm-delete` | A destructive confirmation that the server can refuse. |
| `app-shell` | A sidebar shell that folds behind a menu button on phones. |

Each screen is a folder in `screens/`: `task.md` is the task the agent reads, and `files/` holds the `src/api/` module that stands in for the backend (`screens/_shared/files` adds the fake backend they share). No task names a library or a component.

## Run it

Run every command from the repository root. Pick a folder outside the repository for the apps, for example `WORK=~/.local/state/ouroboros-skills/desk-evidence/ouro-ui/m2/agent-usability`, and a date for the run, `DATE=$(date +%F)`.

1. **Create the three arms.** Each takes a few minutes and needs the network.

   ```bash
   for arm in shadcn shadcn-skill ouro; do scripts/agent-usability/arms/create.sh $arm "$WORK/arms/$arm"; done
   ```

   `OURO_REF=v1.0.0` picks the Ouro HX release (default: `ouro.latestRelease` in `package.json`). The script records what it installed in `<app>/.agent-usability/arm.json`.

2. **For each arm and screen, make a workspace and print its prompt.**

   ```bash
   node scripts/agent-usability/workspace.mts create "$WORK/arms/$arm" $screen "$WORK/$DATE/$arm/$screen"
   node scripts/agent-usability/prompt.mts $arm $screen "$WORK/$DATE/$arm/$screen"
   ```

3. **Give that prompt, and nothing else, to a fresh agent.** One agent per arm and screen, 15 in all. Use the same model and effort for all 15, start each with no earlier context, and don't answer questions or correct its work. The agent's working folder is the workspace.

4. **Collect what the agent left** into the repository:

   ```bash
   node scripts/agent-usability/workspace.mts collect "$WORK/$DATE/$arm/$screen" scripts/agent-usability/runs/$DATE/$arm/$screen
   ```

   This copies the app without `node_modules`, build output, `llms.txt` or the skill. Write `scripts/agent-usability/runs/$DATE/run.md` by hand: the model, the effort, the date, the Ouro HX tag, and anything that went wrong. The workflow prints it above the table.

5. **Score each one.** The scorer runs `npm ci` when the folder has no `node_modules`.

   ```bash
   node scripts/agent-usability/score.mts $arm $screen scripts/agent-usability/runs/$DATE/$arm/$screen
   ```

   It writes `score/score.json`, `score/summary.md` and `score/screenshots/` in that folder and prints the summary. `node scripts/agent-usability/score-runs.mts $DATE` scores every folder of the run in one go.

6. **Make the table.**

   ```bash
   node scripts/agent-usability/table.mts scripts/agent-usability/runs/$DATE --write
   ```

   It prints the markdown table and saves it as `runs/$DATE/results.md`. Commit `runs/$DATE/`. Git ignores the `node_modules` the scorer installed there.

7. **Look at the screenshots.** The score can't judge how a screen looks, whether its delete action reads as destructive, or its loading state. Each screen's last acceptance item is judged only by axe and the screenshots.

The `Agent usability` workflow (`.github/workflows/agent-usability.yml`) repeats steps 5 and 6 on the newest committed run, weekly and on demand, and writes the table and every summary to its job summary. It is not a required check and never runs on pull requests.

## The prompt

Every agent gets the same prompt. Only the first line, the arm's setup line, differs:

- `shadcn`: `Setup: this app uses shadcn/ui. Its components are installed in src/components/ui.`
- `shadcn-skill`: `Setup: this app uses shadcn/ui. Its components are installed in src/components/ui. Before you start, read and follow the shadcn skill in .claude/skills/shadcn/SKILL.md, including the files it links to and the commands it runs.`
- `ouro`: `Setup: this app uses Ouro HX. Its components are installed in src/components/ouro.`

The skill arm's line tells the agent to read the skill, because an agent dispatched into a folder doesn't load that folder's skills by itself. The rest, with the workspace path filled in and the screen's `task.md` appended:

```text
You are a product engineer on a cooking app. Build the screen described below in the app at <workspace>.

- Work only inside <workspace>. The screen is the whole app: render it from `App` in src/App.tsx, and put any new files under src/.
- Build it with the component library the app already has installed. Its docs index is llms.txt in the app root. Don't add npm packages.
- src/api/ stands in for the backend. Use it as it is and don't change it.
- The app turns on dark mode with the `dark` class on the html element. The screen must work in light and dark mode.
- Before you finish, run `npm run build` in <workspace> and fix every error it reports.
- When you are done, reply with a short summary of what you built.
```

`prompt.mts` is the source; `score.test.mjs` fails if this section drifts from it.

## The score

`formula.mts` defines it, in one place. A screen scores out of 100:

| Part | Points | Earned when |
| --- | ---: | --- |
| Typecheck | 20 | `tsc -b` passes over the whole app. |
| Lint | 10 | oxlint, with a stock Vite app's config (`scripts/fixtures/vite-oxlint`), reports nothing in the agent's files. |
| Axe | 20 | 5 for each of 390px light, 390px dark, 1280px light and 1280px dark in which every scanned state rendered and had no violation. |
| Behavior | 50 | Split evenly over the screen's behavior checks. |

- **The agent's files** are the `src/` files that are new or changed since the arm was created, without `src/api/`.
- **Axe** runs with its default rules, including the page-structure ones, because a screen is a whole page. It scans the first render and one more state per screen (the open dialog, the open palette, the form with server errors, the open actions menu, the open navigation on a phone). Base UI's focus guards are left out, as in Ouro's own tests.
- **Behavior checks** live in `checks/<screen>.mts`. They find elements by role, accessible name, label and text, so they hold for any library. Each names the acceptance items it proves; a test fails when an item has neither a check nor a note saying what judges it.
- **The backend stand-in** logs every call on `window.__fakeApi.calls`, which is how the checks see that `deleteCookbook` ran once. If the agent changed a file in `src/api/`, or the app doesn't build, the axe and behavior points are lost and `score.json` says why.
- A low score is a result, not an error: the scorer exits 0 unless it breaks itself.

`score.test.mjs` (part of `pnpm test:scripts`) proves the scorer: a known-good version of every screen (`test/screens/`, plain React) scores 100, and copies with a type error, a lint error, an axe violation, a failing behavior or a row that ignores touch each lose exactly the expected points.

## What the arms pin, and what they can't

- The shadcn CLI is `shadcn@4.21.1`, the version the install test verifies, and the skills CLI is `skills@1.7.0`.
- The skill is pinned to a commit of `shadcn-ui/ui` (`SHADCN_SKILL_REF`). On 2026-10-12 the pinned command and the plain `npx skills add shadcn/ui` installed identical files: two skills, `shadcn` and `migrate-radix-to-base`, in `.claude/skills/`.
- Ouro HX comes from a release tag, whose items pin their own dependencies to the same tag.
- shadcn's components and `llms.txt` come from ui.shadcn.com as they are that day, so `arm.json` records the hash of every installed file, the `llms.txt` hash and the installed package versions.
- On 2026-10-12, `shadcn add --all` installed a `scroll-area.tsx` with an unused `React` import, which fails this app's `tsc -b`. The script records that as `baselineTypecheck` and does not fix it: both shadcn arms start with it, as a user would, and the prompt tells every agent to fix what `npm run build` reports.

## The docs page

The page "Why Ouro HX needs no skill" is not written yet, because it needs real scores. `page.mts` is its hook: today it renders only the results table under the title.
