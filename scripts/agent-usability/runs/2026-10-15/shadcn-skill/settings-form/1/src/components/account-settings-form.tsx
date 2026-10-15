import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"

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

// Form order, used to pick the first field with an error.
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
  const [saveFailed, setSaveFailed] = useState(false)
  const [status, setStatus] = useState("")
  const savingRef = useRef(false)
  const controls = useRef<Partial<Record<FieldName, HTMLElement | null>>>({})

  useEffect(() => {
    let active = true
    loadSettings()
      .then((settings) => {
        if (active) setValues(settings)
      })
      .catch(() => {
        if (active) setLoadFailed(true)
      })
    return () => {
      active = false
    }
  }, [])

  function update<K extends FieldName>(name: K, value: AccountSettings[K]) {
    setValues((current) => (current ? { ...current, [name]: value } : current))
    setStatus("")
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!values || savingRef.current) return

    savingRef.current = true
    setSaving(true)
    setSaveFailed(false)
    setStatus("")

    try {
      const result = await saveSettings(values)
      if (result.ok) {
        setValues(result.settings)
        setErrors({})
        setStatus("Settings saved")
      } else {
        flushSync(() => setErrors(result.errors))
        const first = fieldOrder.find((name) => result.errors[name])
        if (first) controls.current[first]?.focus()
      }
    } catch {
      setSaveFailed(true)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function controlProps(name: FieldName, describedBy: string[] = []) {
    const invalid = Boolean(errors[name])
    const ids = invalid ? [...describedBy, errorId(name)] : describedBy
    return {
      id: fieldId(name),
      "aria-invalid": invalid || undefined,
      "aria-describedby": ids.length > 0 ? ids.join(" ") : undefined,
      ref: (element: HTMLElement | null) => {
        controls.current[name] = element
      },
    }
  }

  function error(name: FieldName) {
    return errors[name] ? (
      <FieldError id={errorId(name)}>{errors[name]}</FieldError>
    ) : null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile and contact</CardTitle>
        <CardDescription>
          How you appear to other cooks and how we reach you.
        </CardDescription>
      </CardHeader>

      {loadFailed ? (
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Your settings didn't load</AlertTitle>
            <AlertDescription>Reload the page to try again.</AlertDescription>
          </Alert>
        </CardContent>
      ) : !values ? (
        <CardContent aria-busy="true">
          <span className="sr-only">Loading your settings…</span>
          <FieldGroup aria-hidden="true">
            {fieldOrder.map((name) => (
              <div key={name} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </FieldGroup>
        </CardContent>
      ) : (
        <form
          noValidate
          aria-label="Account settings"
          onSubmit={handleSubmit}
          className="flex flex-col gap-(--card-spacing)"
        >
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(errors.displayName)}>
                <FieldLabel htmlFor={fieldId("displayName")}>
                  Display name
                </FieldLabel>
                <Input
                  {...controlProps("displayName")}
                  type="text"
                  autoComplete="nickname"
                  value={values.displayName}
                  onChange={(e) => update("displayName", e.target.value)}
                />
                {error("displayName")}
              </Field>

              <Field data-invalid={Boolean(errors.email)}>
                <FieldLabel htmlFor={fieldId("email")}>Email</FieldLabel>
                <Input
                  {...controlProps("email")}
                  type="email"
                  autoComplete="email"
                  value={values.email}
                  onChange={(e) => update("email", e.target.value)}
                />
                {error("email")}
              </Field>

              <Field data-invalid={Boolean(errors.username)}>
                <FieldLabel htmlFor={fieldId("username")}>Username</FieldLabel>
                <Input
                  {...controlProps("username")}
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={values.username}
                  onChange={(e) => update("username", e.target.value)}
                />
                {error("username")}
              </Field>

              <Field data-invalid={Boolean(errors.bio)}>
                <FieldLabel htmlFor={fieldId("bio")}>Bio</FieldLabel>
                <Textarea
                  {...controlProps("bio", ["settings-bio-hint"])}
                  rows={3}
                  value={values.bio}
                  onChange={(e) => update("bio", e.target.value)}
                />
                <FieldDescription id="settings-bio-hint">
                  Up to 160 characters.
                </FieldDescription>
                {error("bio")}
              </Field>

              <Field data-invalid={Boolean(errors.timeZone)}>
                <FieldLabel htmlFor={fieldId("timeZone")}>Time zone</FieldLabel>
                <NativeSelect
                  {...controlProps("timeZone")}
                  className="w-full"
                  value={values.timeZone}
                  onChange={(e) =>
                    update("timeZone", e.target.value as TimeZone)
                  }
                >
                  {timeZones.map((zone) => (
                    <NativeSelectOption key={zone} value={zone}>
                      {zone.replace(/_/g, " ")}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {error("timeZone")}
              </Field>

              <Field
                orientation="horizontal"
                data-invalid={Boolean(errors.productNews)}
              >
                <Checkbox
                  {...controlProps("productNews")}
                  checked={values.productNews}
                  onCheckedChange={(checked) => update("productNews", checked)}
                />
                <FieldLabel htmlFor={fieldId("productNews")}>
                  Email me product news
                </FieldLabel>
              </Field>
              {error("productNews")}

              {saveFailed ? (
                <Alert variant="destructive">
                  <AlertTitle>Your changes weren't saved</AlertTitle>
                  <AlertDescription>
                    We couldn't reach the server. Try again in a moment.
                  </AlertDescription>
                </Alert>
              ) : null}
            </FieldGroup>
          </CardContent>

          <CardFooter className="flex-wrap gap-3">
            <Button
              type="submit"
              disabled={saving}
              focusableWhenDisabled
              aria-busy={saving || undefined}
            >
              {saving ? <Spinner data-icon="inline-start" aria-hidden /> : null}
              Save changes
            </Button>
            <p role="status" className="text-sm text-muted-foreground">
              {status}
            </p>
          </CardFooter>
        </form>
      )}
    </Card>
  )
}
