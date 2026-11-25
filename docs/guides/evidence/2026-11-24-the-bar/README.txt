The bar evaluation, 2026-11-24

Ari's bar for every interface, for people and agents alike: would the people who made the Mac and the iPhone ship it?
Restraint first (each element earns its place), a reference product lends reasons and jobs (never items to copy), an
agent's door gets the same care as a person's screen, and the proof is fresh users doing real tasks, judged
independently, never a score. The question: do fresh agents apply it by instinct, with nothing about it in the
prompt, without overcorrecting into refusing what people use every day?

Method (scripts/bar-eval/run.mjs):
- Each run is a fresh GitHub Copilot CLI session (copilot -p) in a fresh worktree at the product's origin/main, with a
  new COPILOT_HOME (no hooks, plugins or memory), read-only tools (view, grep, glob, web_fetch and read-only shell
  commands), and the repository's own AGENTS.md, as any agent working there has.
- The prompt is a request a person would make, with no word about the bar. The agent replies with its plan, and its
  answer is every message it wrote, in order.
- Two models, claude-sonnet-5.5 and gpt-6.2-sol, two runs each per scenario.
- A fresh judge on a third model, claude-opus-5.5, reads only the request, a line of context about the product, the
  criteria and the answer, and says met or not for each criterion with the answer's words as evidence. A run passes
  when every criterion is met. No score.
- The scenarios and criteria were committed before any run was read (scripts/bar-eval/scenarios.json, commit
  "Bar evaluation: scenarios and pass/fail criteria, written before any run").

Products:
- spoonjoy/spoonjoy-v2 (public): a recipe web app on Ouro HX, with actions and an MCP server for agents. Its runs are
  here in full: runs/<scenario>--<model>--<n>.json holds the prompt, every tool call, the answer and the verdict.
- The first adopter (the product Ouro AX was first measured on, whose code is not public). Its scenarios and answers
  stay with that product; here are its runs' verdicts per criterion only.

Scenarios:
- cook-settings (spoonjoy): plan cook mode settings, given a reference app's fifteen. Tempts copying the list.
- households (spoonjoy): add the agent side for households, given the service's twelve functions. Tempts one action
  per function.
- menus (first adopter): scope the basics a person pointed at in a reference product's three context menus, given
  every item in them. Tempts building the menus item by item. This is the failure that started this work.
  Criteria: restraint (doesn't take the items as the scope; cuts with reasons), jobs (names the jobs and ties each
  kept item to one), basics (keeps and builds the everyday basics, moving a conversation into a section among them),
  agents (gives agents one command per kept job, with the same restraint).
- files (first adopter): design an agent command for files shared in a conversation, given every field the source
  API returns. Tempts exposing everything and adding a second way to find files.
  Criteria: one-way (extends the reads that already list files rather than adding a second way), earns-place (each
  flag and field serves the job), journey (a fresh agent does the job from --help in a call or two; errors give the
  next command), proof (proven with agents doing the job, not only tests).
- sections (first adopter), the counter-scenario: let the person move a conversation into one of their own sections,
  which they do every day and can't yet do in the product. The right answer builds it, well, for people and agents.
  Criteria: builds (plans it end to end, written to the service; no refusal or deferral), both (a natural way in the
  window and one agent command whose result says what moved where), restraint (no extras without a job).

Files:
- baseline/: the runs before any change to Ouro UI, the products' AGENTS.md or the site.
- after-statement/: the same scenarios, models and judge, with the bar as one paragraph in each product's AGENTS.md (the
  question, jobs rather than a reference's items, each element earns its place, the basics built well, an agent's door
  given the same care, proof with fresh people or agents). Spoonjoy ran its main with that paragraph applied on top.
- after-steps/: the same again, with the bar as the four steps Ouro Current writes into AGENTS.md (BAR in
  scripts/current/agents.mjs), and design craft, ax.md, llms.txt and the ouro-check skill pointing at it. Spoonjoy ran
  its main with the block applied on top, as Ouro Current's update brings it.
- probes/: results only, one run per model, of the drafts that led to the four steps, each in both products' AGENTS.md:
  steps-v2 (name the jobs, one way in, leave out what serves no job, prove it), steps-v3 (restraint made the first cut:
  ask what breaks if it goes), steps-v4 (name each thing's job; one way in, not one per item or function), and
  steps-v4-actions (households only, two runs per model: v4 plus a line at the head of Spoonjoy's
  tools/ouro-actions/ouro-actions.mts; no run read that line, so it was left out).

Finding:
- Criteria met, of 76: baseline 21, after-statement 23, after-steps 32. Runs that met every criterion, of 20: 0, 0, 2,
  both of them the counter-scenario. No run of the four tempting scenarios passes in any phase.
- The paragraph didn't change what agents did. The steps did, in part: more answers name the jobs (cook-settings and
  menus, 0 to 2 of 4 each), plan the proof with fresh agents (households and files, 0 to 2 each), and give the
  counter-scenario a way in for people and one agent command (0 to 2), which made its two passes; no answer refused or
  deferred a basic. Restraint barely moved: across the three scenarios that tempt copying a list, 2 of 12 answers cut
  with reasons. Households, the agent side alone, moved least.
- after-steps was judged on each answer's last message. sections--claude-sonnet-5.5--2 wrote its plan, then a second
  message of corrections, so the judge saw no plan and failed it; judged on both messages, it passes every criterion,
  and the counter-scenario passes 3 of 4. In every other run, the earlier messages were a line about its next step.
- AGENTS.md reaches each agent as its instructions; no run opened design craft. Answers that missed used the bar's
  words ("start from the jobs") and still planned the reference's list: the steps are read, and not yet applied while
  the plan is made.
