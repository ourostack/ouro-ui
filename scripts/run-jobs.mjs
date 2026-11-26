/**
 * The one way a script lists the jobs of a workflow run. GitHub answers a page of 100 jobs of a merge group's run
 * (about 150 jobs) with a 502, so jobs come in pages of this size, and a reader follows the pages until it has them all.
 * `scripts/run-jobs.test.mjs` fails a script that reads the jobs endpoint any other way.
 */
export const JOBS_PER_PAGE = 30;

/**
 * The URL of one page of a run's jobs.
 * @param {string} run the run's path, such as `repos/o/r/actions/runs/7` or `…/runs/7/attempts/2`
 * @param {number} page
 * @param {string} [query] extra query parameters, ending in `&`, such as `filter=latest&`
 */
export function jobsPage(run, page, query = "") {
  return `${run}/jobs?${query}per_page=${JOBS_PER_PAGE}&page=${page}`;
}

/**
 * Every job of a run, read with `get(url)` (which returns the parsed `{ total_count, jobs }`) one page at a time.
 * @param {(url: string) => any} get
 * @param {string} run
 * @param {string} [query]
 */
export function listJobs(get, run, query = "") {
  const jobs = [];
  for (let page = 1; ; page += 1) {
    const body = get(jobsPage(run, page, query));
    jobs.push(...(body.jobs ?? []));
    if (jobs.length >= body.total_count || (body.jobs ?? []).length < JOBS_PER_PAGE) return jobs;
  }
}

/** As `listJobs`, for a `get` that returns a promise. */
export async function listJobsAsync(get, run, query = "") {
  const jobs = [];
  for (let page = 1; ; page += 1) {
    const body = await get(jobsPage(run, page, query));
    jobs.push(...(body.jobs ?? []));
    if (jobs.length >= body.total_count || (body.jobs ?? []).length < JOBS_PER_PAGE) return jobs;
  }
}
