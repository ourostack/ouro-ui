/** The generated files that list every component, which main does not commit. */
export const uncommitted: string[];
/** The hand-written llms.txt, whose items list makes site/public/llms.txt. */
export const llmsSource: string;
/** The files among `paths` that git tracks in `root`. */
export function trackedFiles(root: string, paths?: string[]): string[];
/** Whether git tracks `path` in `root`. */
export function isTracked(root: string, path: string): boolean;
