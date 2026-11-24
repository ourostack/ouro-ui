import snapshot from "./current.json";

/** One pin Ouro Current found in a repository, and the release it follows. */
export interface CurrentPin {
  file: string;
  follows: "web" | "core" | "apple" | "windows" | "android";
  current: string;
  latest: string;
  behind: boolean;
}

/** A public repository Ouro Current keeps current, as scripts/current/current.mjs (`publicView`) writes it. */
export interface CurrentRepo {
  repo: string;
  /** `current`: on the newest releases. `pr`: its update pull request is open. `failed`: the last run could not update it. */
  state: "current" | "pr" | "failed" | string;
  pins: CurrentPin[];
  pr: { number: number; url: string } | null;
}

/** current.json: who Ouro Current keeps current. Private repositories are only counted, never named. */
export interface Current {
  schema: number;
  generatedAt: string;
  releases: Record<string, { name: string; tag: string; url: string }>;
  installations: number;
  privateRepos: number;
  repos: CurrentRepo[];
}

/** The list as it was when the site was built; the page asks for a newer one when it opens. */
export const SNAPSHOT = snapshot as unknown as Current;

/** Where each run of .github/workflows/ouro-current.yml publishes the list. */
export const LIVE_URL = "https://raw.githubusercontent.com/ourostack/ouro-ui/adoption-data/current.json";

/** Where a repository owner installs the app. */
export const INSTALL_URL = "https://github.com/apps/ouro-current/installations/new";

/** Whether a fetched value is a list of a shape this page reads, and newer than the one it has. */
export function isNewer(candidate: unknown, current: Current): candidate is Current {
  const value = candidate as Partial<Current> | null;
  return Boolean(value && value.schema === current.schema && Array.isArray(value.repos) && value.releases && typeof value.generatedAt === "string" && value.generatedAt > current.generatedAt);
}

/** A UTC time as people read it: `2026-11-13 22:14 UTC`. */
export const stamp = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
