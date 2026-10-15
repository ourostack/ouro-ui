import { useEffect, useRef, useState } from "react"

import {
  loadSettings,
  saveSettings,
  timeZones,
  type AccountSettings,
  type FieldErrors,
  type TimeZone,
} from "@/api/settings"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

type FieldName = keyof AccountSettings

// Matches the order of the fields on screen, so focus lands on the first error.
const fieldOrder: FieldName[] = [
  "displayName",
  "email",
  "username",
  "bio",
  "timeZone",
  "productNews",
]

const fieldId = (name: FieldName) => `settings-${name}`
const errorId = (name: FieldName) => `settings-${name}-error`

export function AccountSettingsForm() {
  const [values, setValues] = useState<AccountSettings | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState("")
  const savingRef = useRef(false)
  const focusFirstError = useRef(false)

  useEffect(() => {
    let active = true
    loadSettings().then(
      (settings) => {
        if (active) setValues(settings)
      },
      () => {
        if (active) setLoadFailed(true)
      }
    )
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!focusFirstError.current) return
    focusFirstError.current = false
    const first = fieldOrder.find((name) => errors[name])
    if (first) document.getElementById(fieldId(first))?.focus()
  }, [errors])

  function update<K extends FieldName>(name: K, value: AccountSettings[K]) {
    setValues((current) => (current ? { ...current, [name]: value } : current))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!values || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setStatus("")
    try {
      const result = await saveSettings(values)
      if (result.ok) {
        setValues(result.settings)
        setErrors({})
        setStatus("Settings saved")
      } else {
        focusFirstError.current = true
        setErrors(result.errors)
      }
    } catch {
      setStatus("Your settings couldn't be saved. Try again.")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // Props that tie a control to its server message.
  function invalidProps(name: FieldName, hintId?: string) {
    const describedBy = [hintId, errors[name] ? errorId(name) : undefined]
      .filter(Boolean)
      .join(" ")
    return {
      id: fieldId(name),
      "aria-invalid": errors[name] ? true : undefined,
      "aria-describedby": describedBy || undefined,
    }
  }

  function renderError(name: FieldName) {
    return errors[name] ? (
      <FieldError id={errorId(name)}>{errors[name]}</FieldError>
    ) : null
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-labelledby="settings-title">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id="settings-title">Profile and contact</h2>
          </CardTitle>
          <CardDescription>
            How you appear to other cooks and how we reach you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadFailed ? (
            <Alert variant="destructive">
              <AlertTitle>Your settings didn't load</AlertTitle>
              <AlertDescription>Refresh the page to try again.</AlertDescription>
            </Alert>
          ) : !values ? (
            <FieldGroup>
              <p role="status" className="sr-only">
                Loading settings…
              </p>
              {fieldOrder.map((name) => (
                <div key={name} className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ))}
            </FieldGroup>
          ) : (
            <FieldGroup>
              <Field data-invalid={!!errors.displayName || undefined}>
                <FieldLabel htmlFor={fieldId("displayName")}>
                  Display name
                </FieldLabel>
                <Input
                  type="text"
                  autoComplete="name"
                  value={values.displayName}
                  onChange={(e) => update("displayName", e.target.value)}
                  {...invalidProps("displayName")}
                />
                {renderError("displayName")}
              </Field>
              <Field data-invalid={!!errors.email || undefined}>
                <FieldLabel htmlFor={fieldId("email")}>Email</FieldLabel>
                <Input
                  type="email"
                  autoComplete="email"
                  value={values.email}
                  onChange={(e) => update("email", e.target.value)}
                  {...invalidProps("email")}
                />
                {renderError("email")}
              </Field>
              <Field data-invalid={!!errors.username || undefined}>
                <FieldLabel htmlFor={fieldId("username")}>Username</FieldLabel>
                <Input
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={values.username}
                  onChange={(e) => update("username", e.target.value)}
                  {...invalidProps("username")}
                />
                {renderError("username")}
              </Field>
              <Field data-invalid={!!errors.bio || undefined}>
                <FieldLabel htmlFor={fieldId("bio")}>Bio</FieldLabel>
                <Textarea
                  rows={3}
                  value={values.bio}
                  onChange={(e) => update("bio", e.target.value)}
                  {...invalidProps("bio", "settings-bio-hint")}
                />
                <FieldDescription id="settings-bio-hint">
                  Up to 160 characters.
                </FieldDescription>
                {renderError("bio")}
              </Field>
              <Field data-invalid={!!errors.timeZone || undefined}>
                <FieldLabel htmlFor={fieldId("timeZone")}>Time zone</FieldLabel>
                <NativeSelect
                  className="w-full"
                  value={values.timeZone}
                  onChange={(e) =>
                    update("timeZone", e.target.value as TimeZone)
                  }
                  {...invalidProps("timeZone")}
                >
                  {timeZones.map((zone) => (
                    <NativeSelectOption key={zone} value={zone}>
                      {zone.replace(/_/g, " ")}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {renderError("timeZone")}
              </Field>
              <Field
                orientation="horizontal"
                data-invalid={!!errors.productNews || undefined}
              >
                <Checkbox
                  checked={values.productNews}
                  onCheckedChange={(checked) => update("productNews", checked)}
                  {...invalidProps("productNews")}
                />
                <FieldLabel
                  htmlFor={fieldId("productNews")}
                  className="font-normal"
                >
                  Email me product news
                </FieldLabel>
              </Field>
              {renderError("productNews")}
            </FieldGroup>
          )}
        </CardContent>
        <CardFooter className="flex-wrap gap-3">
          <Button
            type="submit"
            disabled={saving || !values}
            aria-busy={saving || undefined}
          >
            {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
            Save changes
          </Button>
          <p role="status" className="text-sm">
            {status}
          </p>
        </CardFooter>
      </Card>
    </form>
  )
}
