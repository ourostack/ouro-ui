import { useEffect, useRef, useState, type FormEvent } from "react";
import { loadSettings, saveSettings, timeZones, type AccountSettings, type FieldErrors, type TimeZone } from "./api/settings";

// A known-good settings-form screen in plain React, for the scorer's tests (score.test.mjs).

const order: (keyof AccountSettings)[] = ["displayName", "email", "username", "bio", "timeZone", "productNews"];

export function App() {
  const [values, setValues] = useState<AccountSettings | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const fields = useRef<Partial<Record<keyof AccountSettings, HTMLElement | null>>>({});

  useEffect(() => {
    loadSettings().then(setValues);
  }, []);

  if (!values) {
    return (
      <main className="page">
        <h1>Account settings</h1>
        <p>Loading…</p>
      </main>
    );
  }

  const set = <K extends keyof AccountSettings>(key: K, value: AccountSettings[K]) => setValues({ ...values, [key]: value });
  const described = (key: keyof AccountSettings, hint?: string) =>
    [hint, errors[key] ? `${key}-error` : undefined].filter(Boolean).join(" ") || undefined;
  const message = (key: keyof AccountSettings) =>
    errors[key] ? (
      <p id={`${key}-error`} className="error">
        {errors[key]}
      </p>
    ) : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !values) return;
    setSaving(true);
    setStatus("");
    const result = await saveSettings(values);
    setSaving(false);
    if (result.ok) {
      setErrors({});
      setStatus("Settings saved");
      return;
    }
    setErrors(result.errors);
    const first = order.find((key) => result.errors[key]);
    if (first) requestAnimationFrame(() => fields.current[first]?.focus());
  }

  return (
    <main className="page">
      <h1>Account settings</h1>
      <form className="form" onSubmit={submit} noValidate>
        <label htmlFor="displayName">Display name</label>
        <input
          id="displayName"
          ref={(element) => {
            fields.current.displayName = element;
          }}
          value={values.displayName}
          onChange={(event) => set("displayName", event.target.value)}
          aria-invalid={errors.displayName ? true : undefined}
          aria-describedby={described("displayName")}
        />
        {message("displayName")}
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          ref={(element) => {
            fields.current.email = element;
          }}
          value={values.email}
          onChange={(event) => set("email", event.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={described("email")}
        />
        {message("email")}
        <label htmlFor="username">Username</label>
        <input
          id="username"
          ref={(element) => {
            fields.current.username = element;
          }}
          value={values.username}
          onChange={(event) => set("username", event.target.value)}
          aria-invalid={errors.username ? true : undefined}
          aria-describedby={described("username")}
        />
        {message("username")}
        <label htmlFor="bio">Bio</label>
        <textarea
          id="bio"
          ref={(element) => {
            fields.current.bio = element;
          }}
          value={values.bio}
          onChange={(event) => set("bio", event.target.value)}
          aria-invalid={errors.bio ? true : undefined}
          aria-describedby={described("bio", "bio-hint")}
        />
        <p id="bio-hint" className="muted">
          Up to 160 characters.
        </p>
        {message("bio")}
        <label htmlFor="timeZone">Time zone</label>
        <select id="timeZone" value={values.timeZone} onChange={(event) => set("timeZone", event.target.value as TimeZone)}>
          {timeZones.map((zone) => (
            <option key={zone}>{zone}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={values.productNews} onChange={(event) => set("productNews", event.target.checked)} />
          Email me product news
        </label>
        <button type="submit" className="button" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <p role="status">{status}</p>
      </form>
    </main>
  );
}
