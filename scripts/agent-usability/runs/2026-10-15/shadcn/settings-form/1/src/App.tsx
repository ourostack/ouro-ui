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

const fieldOrder: FieldName[] = ["displayName", "email", "username", "bio", "timeZone", "productNews"];

const emptySettings: AccountSettings = {
  displayName: "",
  email: "",
  username: "",
  bio: "",
  timeZone: timeZones[0],
  productNews: false,
};

export function App() {
  const [values, setValues] = useState<AccountSettings>(emptySettings);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState("");
  const savingRef = useRef(false);
  const controls = useRef<Partial<Record<FieldName, HTMLElement | null>>>({});

  useEffect(() => {
    let active = true;
    loadSettings().then((settings) => {
      if (!active) return;
      setValues(settings);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  function update<K extends FieldName>(name: K, value: AccountSettings[K]) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setStatus("");
    try {
      const result = await saveSettings(values);
      if (result.ok) {
        setErrors({});
        setValues(result.settings);
        setStatus("Settings saved");
      } else {
        setErrors(result.errors);
        const first = fieldOrder.find((name) => result.errors[name]);
        if (first) controls.current[first]?.focus();
      }
    } catch {
      setStatus("We couldn't save your settings. Check your connection and try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function describedBy(name: FieldName, ...extra: string[]) {
    const ids = [...extra, errors[name] ? `${name}-error` : ""].filter(Boolean);
    return ids.length > 0 ? ids.join(" ") : undefined;
  }

  function errorProps(name: FieldName) {
    return {
      "aria-invalid": errors[name] ? true : undefined,
      "aria-describedby": describedBy(name),
    } as const;
  }

  function fieldError(name: FieldName) {
    return errors[name] ? <FieldError id={`${name}-error`}>{errors[name]}</FieldError> : null;
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Account settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Change how you appear to other cooks and how we contact you.
      </p>

      <form
        className="mt-8"
        noValidate
        onSubmit={handleSubmit}
      >
        <FieldGroup>
          <Field data-invalid={errors.displayName ? true : undefined}>
            <FieldLabel htmlFor="displayName">Display name</FieldLabel>
            <Input
              id="displayName"
              name="displayName"
              type="text"
              autoComplete="name"
              disabled={!loaded}
              value={values.displayName}
              onChange={(e) => update("displayName", e.target.value)}
              ref={(el) => {
                controls.current.displayName = el;
              }}
              {...errorProps("displayName")}
            />
            {fieldError("displayName")}
          </Field>

          <Field data-invalid={errors.email ? true : undefined}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              disabled={!loaded}
              value={values.email}
              onChange={(e) => update("email", e.target.value)}
              ref={(el) => {
                controls.current.email = el;
              }}
              {...errorProps("email")}
            />
            {fieldError("email")}
          </Field>

          <Field data-invalid={errors.username ? true : undefined}>
            <FieldLabel htmlFor="username">Username</FieldLabel>
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              disabled={!loaded}
              value={values.username}
              onChange={(e) => update("username", e.target.value)}
              ref={(el) => {
                controls.current.username = el;
              }}
              {...errorProps("username")}
            />
            {fieldError("username")}
          </Field>

          <Field data-invalid={errors.bio ? true : undefined}>
            <FieldLabel htmlFor="bio">Bio</FieldLabel>
            <FieldDescription id="bio-hint">Up to 160 characters.</FieldDescription>
            <Textarea
              id="bio"
              name="bio"
              rows={3}
              disabled={!loaded}
              value={values.bio}
              onChange={(e) => update("bio", e.target.value)}
              ref={(el) => {
                controls.current.bio = el;
              }}
              aria-invalid={errors.bio ? true : undefined}
              aria-describedby={describedBy("bio", "bio-hint")}
            />
            {fieldError("bio")}
          </Field>

          <Field data-invalid={errors.timeZone ? true : undefined}>
            <FieldLabel htmlFor="timeZone">Time zone</FieldLabel>
            <NativeSelect
              id="timeZone"
              name="timeZone"
              className="w-full"
              disabled={!loaded}
              value={values.timeZone}
              onChange={(e) => update("timeZone", e.target.value as TimeZone)}
              ref={(el) => {
                controls.current.timeZone = el;
              }}
              {...errorProps("timeZone")}
            >
              {timeZones.map((zone) => (
                <NativeSelectOption key={zone} value={zone}>
                  {zone.replace(/_/g, " ")}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {fieldError("timeZone")}
          </Field>

          <Field data-invalid={errors.productNews ? true : undefined}>
            <div className="flex items-center gap-3">
              <Checkbox
                id="productNews"
                name="productNews"
                disabled={!loaded}
                checked={values.productNews}
                onCheckedChange={(checked) => update("productNews", checked)}
                ref={(el) => {
                  controls.current.productNews = el;
                }}
                {...errorProps("productNews")}
              />
              <FieldLabel htmlFor="productNews" className="font-normal">
                Email me product news
              </FieldLabel>
            </div>
            {fieldError("productNews")}
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!loaded || saving} aria-busy={saving || undefined}>
              {saving && <Spinner aria-hidden="true" />}
              Save changes
            </Button>
            <p role="status" className="text-sm text-muted-foreground">
              {!loaded ? "Loading your settings…" : saving ? "Saving…" : status}
            </p>
          </div>
        </FieldGroup>
      </form>
    </main>
  );
}
