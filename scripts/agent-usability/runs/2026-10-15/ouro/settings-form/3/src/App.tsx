import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ouro/button/button";
import { Checkbox } from "@/components/ouro/checkbox/checkbox";
import { Form } from "@/components/ouro/form/form";
import { NativeSelect } from "@/components/ouro/select/native-select";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";
import { TextArea } from "@/components/ouro/text-field/text-area";
import { TextField } from "@/components/ouro/text-field/text-field";
import { formErrors } from "@/lib/ouro/form-answer";
import { loadSettings, saveSettings, timeZones, type AccountSettings, type SaveResult, type TimeZone } from "@/api/settings";

const timeZoneOptions = timeZones.map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }));

export function App() {
  const [values, setValues] = useState<AccountSettings | null>(null);
  const [answer, setAnswer] = useState<SaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    void loadSettings().then((settings) => {
      if (active) setValues(settings);
    });
    return () => {
      active = false;
    };
  }, []);

  const update = <K extends keyof AccountSettings>(key: K, value: AccountSettings[K]) => {
    setValues((current) => (current ? { ...current, [key]: value } : current));
    setSaved(false);
  };

  // The server validates everything, so the submit is handled before Base UI's own
  // constraint check (which would keep a malformed email from ever reaching the server).
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!values || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaved(false);
    try {
      const result = await saveSettings(values);
      setAnswer(result);
      if (result.ok) {
        setValues(result.settings);
        setSaved(true);
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto box-border w-full max-w-xl min-w-0 px-4 py-8 sm:px-6 sm:py-12">
      <Heading level={1} size="2xl">
        Account settings
      </Heading>
      <Text tone="muted" className="mt-2">
        Change how you appear to other cooks and how we contact you.
      </Text>

      {values === null ? (
        <Text role="status" tone="muted" className="mt-8">
          Loading your settings…
        </Text>
      ) : (
        <Form
          aria-label="Account settings"
          noValidate
          onSubmitCapture={submit}
          errors={formErrors(answer, answer && !answer.ok ? answer.errors : null)}
          className="mt-8"
        >
          <TextField
            label="Display name"
            name="displayName"
            autoComplete="name"
            value={values.displayName}
            onValueChange={(value) => update("displayName", String(value))}
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onValueChange={(value) => update("email", String(value))}
          />
          <TextField
            label="Username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={values.username}
            onValueChange={(value) => update("username", String(value))}
          />
          <TextArea
            label="Bio"
            name="bio"
            description="Up to 160 characters."
            rows={4}
            value={values.bio}
            onValueChange={(value) => update("bio", String(value))}
          />
          <NativeSelect
            label="Time zone"
            name="timeZone"
            options={timeZoneOptions}
            value={values.timeZone}
            onValueChange={(value) => update("timeZone", String(value) as TimeZone)}
          />
          <Checkbox
            label="Email me product news"
            name="productNews"
            checked={values.productNews}
            onCheckedChange={(checked) => update("productNews", checked)}
          />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button type="submit" loading={saving} loadingLabel="Saving settings">
              Save changes
            </Button>
            <Text as="span" role="status" tone="success" className="font-medium">
              {saved ? "Settings saved" : ""}
            </Text>
          </div>
        </Form>
      )}
    </main>
  );
}
