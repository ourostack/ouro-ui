"use client";

import { useState } from "react";
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
  const [form, setForm] = useState(0);
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
              // Cleared first, so each save is announced and a pending or failed one never shows the last success.
              setSaved(false);
              const data = new FormData(event.currentTarget);
              const settings: Settings = {
                name: String(data.get("name")).trim(),
                email: String(data.get("email")).trim(),
                language: String(data.get("language")),
                notifications: data.get("notifications") === "on",
              };
              const errors: FormErrors = settings.name.length < 2 ? { name: "Use at least 2 letters." } : ((await onSave?.(settings)) ?? {});
              setAnswer({ errors });
              setSaved(Object.keys(errors).length === 0);
            }}
          >
            <Stack gap="md">
              <TextField label="Display name" name="name" defaultValue={start.name} required autoComplete="nickname" />
              <TextField label="Email" name="email" type="email" defaultValue={start.email} required autoComplete="email" />
              <Select label="Language" name="language" defaultValue={start.language} options={languages} />
              <Switch label="Email notifications" name="notifications" defaultChecked={start.notifications} />
              <div>
                <Button type="submit">Save</Button>
              </div>
              <Text role="status" size="sm" tone="muted">
                {saved ? "Settings saved." : ""}
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
                setAnswer(undefined);
                setSaved(false);
                setDeleted(true);
                setForm((n) => n + 1);
              }}
              trigger={<Button tone="destructive" variant="soft">Delete account</Button>}
            />
          </div>
        </Card>
      </Stack>
    </main>
  );
}
