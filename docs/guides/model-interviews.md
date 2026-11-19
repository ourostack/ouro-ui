# What models build with: interviews

No interview has been published yet. The series is registered, and this page fills in from its first run.

Each frontier model is interviewed as a customer, by the Mom Test: its own practice before any toolkit is named, then three real jobs, each at a product team's scale and a large company's, then what went wrong a year later, and Ouro UI named only in the last question. The questions were [registered before any run](https://github.com/ourostack/ouro-ui-core/blob/bf4539aad126b1d6999883eb84149f86b6acd567/docs/decisions/2026-11-19-model-interviews.md) and don't change between runs; a change starts a new series. This series is kept apart from the [model reviews](model-reviews.md), which ask one question, and its counts never mix with theirs.

Two research arms answer different questions. The **listed arm measures merit**: each job lists the same 20 candidates as the model reviews, by name and link only, in a fresh random order for each session. The **open arm measures discoverability**: the job lists nothing ("Find the options yourself."), so a loss there says agents don't find Ouro UI, not that it's worse. Every pick, count and answer here is computed from the runs' records by a script.

## What the models asked for, and what we changed

This section is synthesis: each answer split into statements, each statement given a Mom Test signal, and statements about the same thing clustered into a finding. Every quote is verbatim and links the transcript it came from, so it can be checked. A finding is filed as an issue labelled `model-review`, ranked by how many models raised it and how strong the evidence is.

No findings yet: they're filled in from the transcripts after a run.

## How it's run

- The script, word for word, with its jobs, scales, arms, tools and budget: the [decision record](https://github.com/ourostack/ouro-ui-core/blob/bf4539aad126b1d6999883eb84149f86b6acd567/docs/decisions/2026-11-19-model-interviews.md), the [methodology](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/METHODOLOGY.md#the-interviews-series) and the [harness](https://github.com/ourostack/ouro-ui/blob/main/scripts/model-reviews/interviews.mjs).
- Each model gets four sessions: the listed and open arms, each at a product team's scale and a large company's. Every session runs the same six questions in the same words; only the order of the three jobs, and of the listed candidates, is drawn fresh for each session.
- The tools, runtime and search are the model reviews', and every session has the same research budget: 900,000 characters of search and fetch results, because a session researches three jobs.
