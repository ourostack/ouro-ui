import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  loadSettings,
  saveSettings,
  timeZones,
  type AccountSettings,
  type FieldErrors,
  type TimeZone,
} from "@/api/settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

type FieldName = keyof AccountSettings;

/** Fields in the order they appear, used to focus the first one with an error. */
const fieldOrder: FieldName[] = ["displayName", "email", "username", "bio", "timeZone", "productNews"];

const fieldId = (name: FieldName) => `settings-${name}`;
const errorId = (name: FieldName) => `settings-${name}-error`;

export function App() {
  const [values, setValues] = useState<AccountSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [errorRound, setErrorRound] = useState(0);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadSettings().then(
      (settings) => {
        if (!cancelled) setValues(settings);
      },
      () => {
        if (!cancelled) setLoadFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Move focus to the first field the server flagged, once its message has rendered.
  useEffect(() => {
    if (errorRound === 0) return;
    const first = fieldOrder.find((name) => errors[name]);
    if (first) document.getElementById(fieldId(first))?.focus();
  }, [errorRound, errors]);

  function update<K extends FieldName>(name: K, value: AccountSettings[K]) {
    setValues((current) => (current ? { ...current, [name]: value } : current));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setStatus("");
    try {
      const result = await saveSettings(values);
      if (result.ok) {
        setValues(result.settings);
        setErrors({});
        setStatus("Settings saved");
      } else {
        setErrors(result.errors);
        setErrorRound((round) => round + 1);
      }
    } catch {
      setStatus("Your settings could not be saved. Check your connection and try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  /** Props that tie a control to its server message. */
  function errorProps(name: FieldName, describedBy?: string) {
    const message = errors[name];
    const ids = [describedBy, message ? errorId(name) : undefined].filter(Boolean).join(" ");
    return {
      id: fieldId(name),
      name,
      "aria-invalid": message ? true : undefined,
      "aria-describedby": ids || undefined,
    };
  }

  function errorMessage(name: FieldName) {
    const message = errors[name];
    return message ? <FieldError id={errorId(name)}>{message}</FieldError> : null;
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Account settings</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Change how you appear to other cooks and how we contact you.
      </p>

      {values === null ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          {loadFailed ? (
            "Your settings could not be loaded. Reload the page to try again."
          ) : (
            <>
              <Spinner aria-hidden="true" />
              Loading settings…
            </>
          )}
        </p>
      ) : (
        <form noValidate onSubmit={handleSubmit} aria-label="Account settings">
          <FieldGroup>
            <Field data-invalid={errors.displayName ? true : undefined}>
              <FieldLabel htmlFor={fieldId("displayName")}>Display name</FieldLabel>
              <Input
                type="text"
                autoComplete="name"
                value={values.displayName}
                onChange={(event) => update("displayName", event.target.value)}
                {...errorProps("displayName")}
              />
              {errorMessage("displayName")}
            </Field>

            <Field data-invalid={errors.email ? true : undefined}>
              <FieldLabel htmlFor={fieldId("email")}>Email</FieldLabel>
              <Input
                type="email"
                autoComplete="email"
                value={values.email}
                onChange={(event) => update("email", event.target.value)}
                {...errorProps("email")}
              />
              {errorMessage("email")}
            </Field>

            <Field data-invalid={errors.username ? true : undefined}>
              <FieldLabel htmlFor={fieldId("username")}>Username</FieldLabel>
              <Input
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={values.username}
                onChange={(event) => update("username", event.target.value)}
                {...errorProps("username")}
              />
              {errorMessage("username")}
            </Field>

            <Field data-invalid={errors.bio ? true : undefined}>
              <FieldLabel htmlFor={fieldId("bio")}>Bio</FieldLabel>
              <FieldDescription id="settings-bio-hint">Up to 160 characters.</FieldDescription>
              <Textarea
                rows={4}
                value={values.bio}
                onChange={(event) => update("bio", event.target.value)}
                {...errorProps("bio", "settings-bio-hint")}
              />
              {errorMessage("bio")}
            </Field>

            <Field data-invalid={errors.timeZone ? true : undefined}>
              <FieldLabel htmlFor={fieldId("timeZone")}>Time zone</FieldLabel>
              <NativeSelect
                className="w-full"
                value={values.timeZone}
                onChange={(event) => update("timeZone", event.target.value as TimeZone)}
                {...errorProps("timeZone")}
              >
                {timeZones.map((zone) => (
                  <NativeSelectOption key={zone} value={zone}>
                    {zone.replace(/_/g, " ")}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {errorMessage("timeZone")}
            </Field>

            <Field orientation="horizontal" data-invalid={errors.productNews ? true : undefined}>
              <Checkbox
                checked={values.productNews}
                onCheckedChange={(checked) => update("productNews", checked)}
                {...errorProps("productNews")}
              />
              <FieldLabel htmlFor={fieldId("productNews")} className="font-normal">
                Email me product news
              </FieldLabel>
            </Field>
            {errorMessage("productNews")}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={saving} aria-busy={saving ? true : undefined}>
                {saving && <Spinner aria-hidden="true" />}
                Save changes
              </Button>
            </div>
          </FieldGroup>
        </form>
      )}

      <p role="status" className="mt-4 min-h-5 text-sm font-medium">
        {status}
      </p>
    </main>
  );
}
