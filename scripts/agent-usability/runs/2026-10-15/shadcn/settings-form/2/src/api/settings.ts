import { request } from "./fake-backend";

export interface AccountSettings {
  displayName: string;
  email: string;
  username: string;
  bio: string;
  timeZone: TimeZone;
  productNews: boolean;
}

export const timeZones = ["Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Australia/Sydney"] as const;
export type TimeZone = (typeof timeZones)[number];

/** The server's messages, keyed by field. Only fields with a problem are present. */
export type FieldErrors = Partial<Record<keyof AccountSettings, string>>;

export type SaveResult = { ok: true; settings: AccountSettings } | { ok: false; errors: FieldErrors };

let saved: AccountSettings = {
  displayName: "Ada Lovelace",
  email: "ada@example.com",
  username: "ada",
  bio: "Cooks for a crowd on Sundays.",
  timeZone: "Europe/London",
  productNews: true,
};

/** The signed-in user's current settings. */
export function loadSettings(): Promise<AccountSettings> {
  return request("loadSettings", [], () => ({ ...saved }), 200);
}

/** Saves the settings. The server validates every field and answers with its messages. */
export function saveSettings(values: AccountSettings): Promise<SaveResult> {
  return request("saveSettings", [values], (): SaveResult => {
    const errors = validate(values);
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    saved = { ...values };
    return { ok: true, settings: { ...saved } };
  });
}

function validate(values: AccountSettings): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.displayName.trim()) errors.displayName = "Enter a display name.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) errors.email = "Enter an email address like name@example.com.";
  else if (values.email.toLowerCase() === "taken@example.com") errors.email = "That email is already used by another account.";
  if (!/^[a-z0-9-]{3,20}$/.test(values.username)) errors.username = "Use 3 to 20 lowercase letters, numbers or dashes.";
  if (values.bio.length > 160) errors.bio = "Keep your bio to 160 characters or fewer.";
  return errors;
}
