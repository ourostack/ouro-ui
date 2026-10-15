import { useEffect, useRef, useState, type FormEvent, type JSX } from "react";
import { Button } from "@/components/ouro/button/button";
import { Checkbox } from "@/components/ouro/checkbox/checkbox";
import { NativeSelect } from "@/components/ouro/select/native-select";
import { Spinner } from "@/components/ouro/spinner/spinner";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";
import { TextArea } from "@/components/ouro/text-field/text-area";
import { TextField } from "@/components/ouro/text-field/text-field";
import { loadSettings, saveSettings, timeZones, type AccountSettings, type FieldErrors, type TimeZone } from "@/api/settings";

const timeZoneOptions = timeZones.map((zone) => ({ value: zone, label: zone }));

/**
 * The account settings page: loads the signed-in cook's settings into one form and saves
 * them. The server validates every field; each of its messages shows under its own field.
 */
export function AccountSettingsPage(): JSX.Element {
  const [values, setValues] = useState<AccountSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // How many error answers have arrived; each new one moves focus to the first invalid field.
  const [errorAnswers, setErrorAnswers] = useState(0);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let active = true;
    loadSettings().then(
      (settings) => active && setValues(settings),
      () => active && setLoadFailed(true),
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (errorAnswers === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errorAnswers]);

  function update<K extends keyof AccountSettings>(name: K, value: AccountSettings[K]) {
    setValues((current) => (current ? { ...current, [name]: value } : current));
    setSaved(false);
    // The message no longer describes what is in the field; the next save checks it again.
    setErrors((current) => {
      if (!(name in current)) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaved(false);
    try {
      const result = await saveSettings(values);
      if (result.ok) {
        setValues(result.settings);
        setErrors({});
        setSaved(true);
      } else {
        setErrors(result.errors);
        setErrorAnswers((count) => count + 1);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto box-border w-full max-w-xl min-w-0 px-4 py-8 sm:py-12">
      <Heading level={1}>Account settings</Heading>
      <Text tone="muted" className="mt-2">
        Change how you appear to other cooks and how we contact you.
      </Text>

      {values === null ? (
        <div role="status" className="mt-8 flex items-center gap-2">
          {loadFailed ? (
            <Text tone="destructive">Your settings could not be loaded. Reload the page to try again.</Text>
          ) : (
            <>
              <Spinner size="sm" label="Loading settings" />
              <Text tone="muted">Loading settings…</Text>
            </>
          )}
        </div>
      ) : (
        <form ref={formRef} noValidate onSubmit={submit} aria-busy={saving} className="mt-8 grid min-w-0 gap-5">
          <TextField
            label="Display name"
            name="displayName"
            autoComplete="name"
            value={values.displayName}
            onValueChange={(value) => update("displayName", value)}
            error={errors.displayName}
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            value={values.email}
            onValueChange={(value) => update("email", value)}
            error={errors.email}
          />
          <TextField
            label="Username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={values.username}
            onValueChange={(value) => update("username", value)}
            error={errors.username}
          />
          <TextArea
            label="Bio"
            name="bio"
            description="Up to 160 characters."
            rows={4}
            value={values.bio}
            onValueChange={(value) => update("bio", value)}
            error={errors.bio}
          />
          <NativeSelect
            label="Time zone"
            name="timeZone"
            options={timeZoneOptions}
            value={values.timeZone}
            onChange={(event) => update("timeZone", event.target.value as TimeZone)}
            error={errors.timeZone}
          />
          <Checkbox
            label="Email me product news"
            name="productNews"
            checked={values.productNews}
            onCheckedChange={(checked) => update("productNews", checked)}
            error={errors.productNews}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button type="submit" loading={saving} loadingLabel="Saving settings">
              Save changes
            </Button>
            <div role="status" className="min-w-0">
              {saved && <Text tone="success">Settings saved</Text>}
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
