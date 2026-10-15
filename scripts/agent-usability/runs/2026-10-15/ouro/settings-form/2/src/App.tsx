import { useEffect, useRef, useState, type FormEvent } from "react";
import { loadSettings, saveSettings, timeZones, type AccountSettings, type SaveResult, type TimeZone } from "@/api/settings";
import { Alert } from "@/components/ouro/alert/alert";
import { Button } from "@/components/ouro/button/button";
import { Checkbox } from "@/components/ouro/checkbox/checkbox";
import { Form } from "@/components/ouro/form/form";
import { NativeSelect } from "@/components/ouro/select/native-select";
import { Spinner } from "@/components/ouro/spinner/spinner";
import { Stack } from "@/components/ouro/stack/stack";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";
import { TextArea } from "@/components/ouro/text-field/text-area";
import { TextField } from "@/components/ouro/text-field/text-field";
import { formErrors } from "@/lib/ouro/form-answer";

const timeZoneOptions = timeZones.map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }));

/** The form's fields as the settings the server expects. */
function readSettings(form: HTMLFormElement): AccountSettings {
  const data = new FormData(form);
  const text = (name: keyof AccountSettings) => String(data.get(name) ?? "");
  return {
    displayName: text("displayName"),
    email: text("email"),
    username: text("username"),
    bio: text("bio"),
    timeZone: text("timeZone") as TimeZone,
    productNews: data.get("productNews") !== null,
  };
}

function SettingsForm({ settings }: { settings: AccountSettings }) {
  const [saving, setSaving] = useState(false);
  const [answer, setAnswer] = useState<SaveResult | undefined>(undefined);
  const savingRef = useRef(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      setAnswer(await saveSettings(readSettings(event.currentTarget)));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Form
      aria-labelledby="settings-title"
      noValidate
      aria-busy={saving || undefined}
      errors={formErrors(answer, answer && !answer.ok ? answer.errors : undefined)}
      onSubmit={submit}
    >
      <TextField label="Display name" name="displayName" autoComplete="nickname" defaultValue={settings.displayName} />
      <TextField label="Email" name="email" type="email" autoComplete="email" defaultValue={settings.email} />
      <TextField label="Username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} defaultValue={settings.username} />
      <TextArea label="Bio" name="bio" description="Up to 160 characters." rows={4} defaultValue={settings.bio} />
      <NativeSelect label="Time zone" name="timeZone" options={timeZoneOptions} defaultValue={settings.timeZone} />
      <Checkbox label="Email me product news" name="productNews" defaultChecked={settings.productNews} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={saving} loadingLabel="Saving settings">
          Save changes
        </Button>
      </div>
      {answer?.ok && !saving && <Alert tone="success" title="Settings saved" />}
    </Form>
  );
}

export function App() {
  const [settings, setSettings] = useState<AccountSettings | undefined>(undefined);

  useEffect(() => {
    let current = true;
    void loadSettings().then((loaded) => {
      if (current) setSettings(loaded);
    });
    return () => {
      current = false;
    };
  }, []);

  return (
    <main className="mx-auto w-full max-w-xl min-w-0 px-4 py-8 sm:px-6 sm:py-12">
      <Stack gap="lg">
        <Stack gap="xs">
          <Heading level={1} id="settings-title">
            Account settings
          </Heading>
          <Text tone="muted">Change how you appear to other cooks and how we contact you.</Text>
        </Stack>
        {settings ? (
          <SettingsForm settings={settings} />
        ) : (
          <Spinner label="Loading your settings" />
        )}
      </Stack>
    </main>
  );
}
