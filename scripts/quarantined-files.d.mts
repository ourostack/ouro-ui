export function quarantinedFiles(
  entries: { title: string; expiry: string; file: string }[],
  now?: Date,
): string[];
export const quarantinedFilesNow: () => string[];
