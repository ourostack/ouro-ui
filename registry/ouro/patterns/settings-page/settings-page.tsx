"use client";

import { useRef, useState } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Card } from "@/registry/ouro/components/ouro/card/card";
import { ColorSchemeToggle } from "@/registry/ouro/components/ouro/color-scheme-toggle/color-scheme-toggle";
import { ConfirmDialog } from "@/registry/ouro/components/ouro/dialog/confirm-dialog";
import { Form } from "@/registry/ouro/components/ouro/form/form";
import { PageHeader } from "@/registry/ouro/components/ouro/page-header/page-header";
import { Select } from "@/registry/ouro/components/ouro/select/select";
import { Stack } from "@/registry/ouro/components/ouro/stack/stack";
import { Switch } from "@/registry/ouro/components/ouro/switch/switch";
import { Text } from "@/registry/ouro/components/ouro/text/text";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { formErrors, type FormErrors } from "@/registry/ouro/lib/ouro/form-answer";

/** What the page saves. Replace it with your app's settings. */
export interface Settings {
  name: string;
  email: string;
  language: string;
  notifications: boolean;
}

const languages = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
];

/** The fields' starting values, and what a deleted account goes back to. Replace them with the person's own. */
const empty: Settings = { name: "", email: "", language: "en", notifications: true };

/**
 * A whole settings page: a header with the light and dark toggle, a profile form the browser validates, and a danger
 * zone that confirms before it deletes. It draws itself from Ouro's theme, with layout classes only. Render it, then
 * change its fields and `onSave` to what your app keeps.
 *
 * What it already does, which Ouro's own tests cover, so your tests need only cover what you add: the browser's
 * required and email checks run before `onSave`; a name under 2 letters and the errors `onSave` returns show on
 * their fields; "Settings saved." is announced after each save, and not for a save a later submit or a delete
 * overtook; the delete waits for the person to confirm, says "Account deleted.", and a delete that fails keeps the dialog open.
 *
 * What the app wires up: the toggle needs `ColorSchemeProvider` around the app, and the script that sets light or
 * dark before the first paint, as the agent quickstart sets up: https://ui.ouroboros.bot/docs/agent-quickstart.md.
 *
 * To change it, edit this file: the `Settings` type, the `empty` values, and the fields. The parts it uses take:
 * - `TextField`: `label`, `name`, `type`, `required`, `defaultValue`, `autoComplete`, `description`.
 * - `Select`: `label`, `name`, `options` (`{ value, label }[]`), `defaultValue`.
 * - `Switch`: `label`, `name`, `defaultChecked`; the form reads it as `"on"` when it's on.
 * - `Form`: `errors` (field name to message) and `onSubmit`; the page passes `formErrors(answer, answer?.errors)` as `errors`.
 * - `ConfirmDialog`: `title`, `description`, `confirmLabel`, `tone`, `trigger`, and `onConfirm`, whose promise keeps it
 *   open until it settles.
 * - `ColorSchemeToggle`: `variant="segmented"` shows light, dark and system side by side instead of a menu button.
 * - `Card`: `title`, `description`, `headingLevel`. `PageHeader`: `title`, `description`, `actions`. `Stack`: `gap`.
 * A component's whole API is on its page, https://ui.ouroboros.bot/docs/<item>.md.
 *
 * @claim "What it already does, which Ouro's own" test/patterns.test.tsx verify:testExists(test/patterns.test.tsx::SettingsPage > saves only once the browser's checks and its own pass, shows a returned error on its field, and says when it saved)
 * @claim "What it already does, which Ouro's own" test/patterns.test.tsx verify:testExists(test/patterns.test.tsx::SettingsPage > empties its status for a frame before a repeat save that resolves at once, so a screen reader hears it again)
 * @claim "What it already does, which Ouro's own" test/patterns.test.tsx verify:testExists(test/patterns.test.tsx::SettingsPage > lets a save that finishes late change nothing once a later submit has answered)
 * @claim "What it already does, which Ouro's own" test/patterns.test.tsx verify:testExists(test/patterns.test.tsx::SettingsPage > lets a save still running when the account is deleted change nothing on the emptied form)
 * @claim "What it already does, which Ouro's own" test/patterns.test.tsx verify:testExists(test/patterns.test.tsx::SettingsPage > deletes the account only once the person confirms, then starts the form over)
 * @claim "What it already does, which Ouro's own" test/patterns.test.tsx verify:testExists(test/patterns.test.tsx::SettingsPage > keeps a running save's answer when the delete fails, since the account is still there)
 *
 * @example
 * import { SettingsPage } from "@/components/patterns/settings-page";
 * <SettingsPage onSave={async (settings) => api.saveSettings(settings)} onDelete={() => api.deleteAccount()} />
 */
export function SettingsPage({
  initial = empty,
  onSave,
  onDelete,
}: {
  /** The settings the form starts with. */
  initial?: Settings;
  /** Saves the settings; return field errors (`{ email: "Taken." }`) to show them on their fields. */
  onSave?: (settings: Settings) => FormErrors | void | Promise<FormErrors | void>;
  /** Deletes the account, after the person confirms. */
  onDelete?: () => void | Promise<void>;
}) {
  // Each submit's own answer, so the same mistake shows again after an edit.
  const [answer, setAnswer] = useState<{ errors: FormErrors }>();
  const [saved, setSaved] = useState(false);
  // Whether the latest save is still running, so Save shows it and a second press does not send it twice.
  const [saving, setSaving] = useState(false);
  const [gone, setGone] = useState(false);
  const [form, setForm] = useState(0);
  const frame = useRef(0);
  // Which submit or delete came last, so a save that finishes late changes nothing.
  const latest = useRef(0);
  // After a delete the fields start empty, not from the deleted account's settings.
  const [deleted, setDeleted] = useState(false);
  const start = deleted ? empty : initial;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Stack gap="lg">
        <PageHeader title="Settings" description="Your profile and how we reach you." actions={<ColorSchemeToggle />} />
        <Card title="Profile" description="Shown to the people you work with." headingLevel={2}>
          <Form
            key={form}
            errors={formErrors(answer, answer?.errors)}
            onSubmit={async (event) => {
              // The browser's own checks (required, type="email") pass before this runs.
              event.preventDefault();
              // Cleared first, so a pending or failed save never shows the last success.
              cancelAnimationFrame(frame.current);
              setSaved(false);
              setGone(false);
              const mine = ++latest.current;
              const data = new FormData(event.currentTarget);
              const settings: Settings = {
                name: String(data.get("name")).trim(),
                email: String(data.get("email")).trim(),
                language: String(data.get("language")),
                notifications: data.get("notifications") === "on",
              };
              let errors: FormErrors;
              if (settings.name.length < 2) {
                errors = { name: "Use at least 2 letters." };
                setSaving(false);
              } else {
                setSaving(true);
                try {
                  errors = (await onSave?.(settings)) ?? {};
                } finally {
                  if (mine === latest.current) setSaving(false);
                }
              }
              if (mine !== latest.current) return;
              setAnswer({ errors });
              // A frame after the clear, so a screen reader hears each save, even one that resolves at once.
              if (Object.keys(errors).length === 0) frame.current = requestAnimationFrame(() => setSaved(true));
            }}
          >
            <Stack gap="md">
              <TextField label="Display name" name="name" defaultValue={start.name} required autoComplete="nickname" />
              <TextField label="Email" name="email" type="email" defaultValue={start.email} required autoComplete="email" />
              <Select label="Language" name="language" defaultValue={start.language} options={languages} />
              <Switch label="Email notifications" name="notifications" defaultChecked={start.notifications} />
              <div>
                <Button type="submit" loading={saving} loadingLabel="Saving settings">
                  Save
                </Button>
              </div>
              <Text role="status" size="sm" tone="muted">
                {saved ? "Settings saved." : gone ? "Account deleted." : ""}
              </Text>
            </Stack>
          </Form>
        </Card>
        <Card title="Delete account" description="This deletes your profile and settings. It can't be undone." headingLevel={2}>
          <div>
            <ConfirmDialog
              title="Delete your account?"
              description="This deletes your profile and settings. It can't be undone."
              confirmLabel="Delete account"
              tone="destructive"
              onConfirm={async () => {
                await onDelete?.();
                // Only once it's deleted, so a failed delete leaves the last save's answer.
                latest.current++;
                cancelAnimationFrame(frame.current);
                setAnswer(undefined);
                setSaved(false);
                setSaving(false);
                setDeleted(true);
                setForm((n) => n + 1);
                // A frame after the form is replaced, so the new status region is there to announce it.
                frame.current = requestAnimationFrame(() => setGone(true));
              }}
              trigger={<Button tone="destructive" variant="soft">Delete account</Button>}
            />
          </div>
        </Card>
      </Stack>
    </main>
  );
}
