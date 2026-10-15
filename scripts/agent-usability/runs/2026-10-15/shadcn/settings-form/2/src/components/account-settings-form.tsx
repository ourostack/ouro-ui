import { useEffect, useId, useRef, useState, type FormEvent } from "react"

import {
  loadSettings,
  saveSettings,
  timeZones,
  type AccountSettings,
  type FieldErrors,
  type TimeZone,
} from "@/api/settings"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

type FieldName = keyof AccountSettings

/** The order the fields appear in, used to focus the first one with an error. */
const fieldOrder: FieldName[] = [
  "displayName",
  "email",
  "username",
  "bio",
  "timeZone",
  "productNews",
]

const emptySettings: AccountSettings = {
  displayName: "",
  email: "",
  username: "",
  bio: "",
  timeZone: timeZones[0],
  productNews: false,
}

export function AccountSettingsForm() {
  const id = useId()
  const [values, setValues] = useState<AccountSettings>(emptySettings)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState("")
  const [focusRequest, setFocusRequest] = useState<{ name: FieldName }>()

  const savingRef = useRef(false)
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLElement | null>>>({})

  useEffect(() => {
    let active = true
    loadSettings()
      .then((settings) => {
        if (active) setValues(settings)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Runs once per failed save, after the messages have rendered.
  useEffect(() => {
    if (focusRequest) fieldRefs.current[focusRequest.name]?.focus()
  }, [focusRequest])

  function update<K extends FieldName>(name: K, value: AccountSettings[K]) {
    setValues((current) => ({ ...current, [name]: value }))
    setStatus("")
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingRef.current || loading) return
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
        setErrors(result.errors)
        const first = fieldOrder.find((name) => result.errors[name])
        if (first) setFocusRequest({ name: first })
      }
    } catch {
      setStatus("We couldn't save your settings. Try again.")
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const ids = (name: FieldName) => ({
    control: `${id}-${name}`,
    error: `${id}-${name}-error`,
    hint: `${id}-${name}-hint`,
  })

  /** Props that tie a control to its server message. */
  const errorProps = (name: FieldName, extraDescribedBy?: string) => {
    const message = errors[name]
    const describedBy = [message ? ids(name).error : undefined, extraDescribedBy]
      .filter(Boolean)
      .join(" ")
    return {
      "aria-invalid": message ? true : undefined,
      "aria-errormessage": message ? ids(name).error : undefined,
      "aria-describedby": describedBy || undefined,
    }
  }

  const renderError = (name: FieldName) =>
    errors[name] ? (
      <FieldError id={ids(name).error} role={undefined}>
        {errors[name]}
      </FieldError>
    ) : null

  const disabled = loading || loadError

  return (
    <Card>
      <CardContent>
        <form
          noValidate
          onSubmit={handleSubmit}
          aria-busy={loading || undefined}
        >
          <FieldGroup>
            <Field data-invalid={!!errors.displayName || undefined}>
              <FieldLabel htmlFor={ids("displayName").control}>
                Display name
              </FieldLabel>
              <Input
                id={ids("displayName").control}
                ref={(el) => {
                  fieldRefs.current.displayName = el
                }}
                name="displayName"
                type="text"
                autoComplete="name"
                value={values.displayName}
                disabled={disabled}
                onChange={(e) => update("displayName", e.target.value)}
                {...errorProps("displayName")}
              />
              {renderError("displayName")}
            </Field>

            <Field data-invalid={!!errors.email || undefined}>
              <FieldLabel htmlFor={ids("email").control}>Email</FieldLabel>
              <Input
                id={ids("email").control}
                ref={(el) => {
                  fieldRefs.current.email = el
                }}
                name="email"
                type="email"
                autoComplete="email"
                spellCheck={false}
                value={values.email}
                disabled={disabled}
                onChange={(e) => update("email", e.target.value)}
                {...errorProps("email")}
              />
              {renderError("email")}
            </Field>

            <Field data-invalid={!!errors.username || undefined}>
              <FieldLabel htmlFor={ids("username").control}>
                Username
              </FieldLabel>
              <Input
                id={ids("username").control}
                ref={(el) => {
                  fieldRefs.current.username = el
                }}
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={values.username}
                disabled={disabled}
                onChange={(e) => update("username", e.target.value)}
                {...errorProps("username")}
              />
              {renderError("username")}
            </Field>

            <Field data-invalid={!!errors.bio || undefined}>
              <FieldLabel htmlFor={ids("bio").control}>Bio</FieldLabel>
              <Textarea
                id={ids("bio").control}
                ref={(el) => {
                  fieldRefs.current.bio = el
                }}
                name="bio"
                rows={3}
                value={values.bio}
                disabled={disabled}
                onChange={(e) => update("bio", e.target.value)}
                {...errorProps("bio", ids("bio").hint)}
              />
              {renderError("bio")}
              <FieldDescription id={ids("bio").hint}>
                Up to 160 characters.
              </FieldDescription>
            </Field>

            <Field data-invalid={!!errors.timeZone || undefined}>
              <FieldLabel htmlFor={ids("timeZone").control}>
                Time zone
              </FieldLabel>
              <NativeSelect
                id={ids("timeZone").control}
                ref={(el) => {
                  fieldRefs.current.timeZone = el
                }}
                name="timeZone"
                className="w-full"
                value={values.timeZone}
                disabled={disabled}
                onChange={(e) =>
                  update("timeZone", e.target.value as TimeZone)
                }
                {...errorProps("timeZone")}
              >
                {timeZones.map((zone) => (
                  <NativeSelectOption key={zone} value={zone}>
                    {zone.replace(/_/g, " ")}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {renderError("timeZone")}
            </Field>

            <Field data-invalid={!!errors.productNews || undefined}>
              <div className="flex items-center gap-3">
                <Checkbox
                  id={ids("productNews").control}
                  ref={(el: HTMLElement | null) => {
                    fieldRefs.current.productNews = el
                  }}
                  name="productNews"
                  // A native button takes the label's `for`, so the label names
                  // and toggles one element rather than the hidden input.
                  nativeButton
                  render={<button type="button" />}
                  aria-labelledby={`${ids("productNews").control}-label`}
                  checked={values.productNews}
                  disabled={disabled}
                  onCheckedChange={(checked) => update("productNews", checked)}
                  {...errorProps("productNews")}
                />
                <FieldLabel
                  id={`${ids("productNews").control}-label`}
                  htmlFor={ids("productNews").control}
                  className="font-normal"
                >
                  Email me product news
                </FieldLabel>
              </div>
              {renderError("productNews")}
            </Field>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                disabled={saving || disabled}
                aria-busy={saving || undefined}
              >
                {saving && <Spinner role={undefined} aria-hidden="true" />}
                Save changes
              </Button>
              <p role="status" className="text-sm text-muted-foreground">
                {loading
                  ? "Loading your settings…"
                  : loadError
                    ? "We couldn't load your settings. Reload the page to try again."
                    : saving
                      ? "Saving…"
                      : status}
              </p>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
