import { useEffect, useRef, useState, type FormEvent } from "react"
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
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

type FieldName = keyof AccountSettings

// The order fields appear in, so focus can move to the first one with an error.
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

function describedBy(...ids: Array<string | false | undefined>) {
  return ids.filter(Boolean).join(" ") || undefined
}

export function AccountSettingsForm() {
  const [values, setValues] = useState<AccountSettings>(emptySettings)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [status, setStatus] = useState("")
  const savingRef = useRef(false)
  const controls = useRef<Partial<Record<FieldName, HTMLElement | null>>>({})

  useEffect(() => {
    let cancelled = false
    loadSettings()
      .then((settings) => {
        if (!cancelled) setValues(settings)
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function update<K extends FieldName>(name: K, value: AccountSettings[K]) {
    setValues((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading || savingRef.current) return

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

  const disabled = loading || loadFailed

  return (
    <form noValidate onSubmit={handleSubmit} aria-busy={saving || undefined}>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Profile and contact</h2>
          </CardTitle>
          <CardDescription>
            What other cooks see, and where we send email.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {loadFailed && (
            <Alert variant="destructive">
              <AlertTitle>Your settings couldn't be loaded</AlertTitle>
              <AlertDescription>Reload the page to try again.</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Field data-invalid={!!errors.displayName || undefined}>
              <FieldLabel htmlFor="displayName">Display name</FieldLabel>
              <Input
                id="displayName"
                name="displayName"
                type="text"
                autoComplete="name"
                ref={(el) => {
                  controls.current.displayName = el
                }}
                value={values.displayName}
                disabled={disabled}
                onChange={(e) => update("displayName", e.target.value)}
                aria-invalid={!!errors.displayName || undefined}
                aria-describedby={describedBy(
                  errors.displayName && "displayName-error"
                )}
              />
              {errors.displayName && (
                <FieldError id="displayName-error">
                  {errors.displayName}
                </FieldError>
              )}
            </Field>

            <Field data-invalid={!!errors.email || undefined}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                ref={(el) => {
                  controls.current.email = el
                }}
                value={values.email}
                disabled={disabled}
                onChange={(e) => update("email", e.target.value)}
                aria-invalid={!!errors.email || undefined}
                aria-describedby={describedBy(errors.email && "email-error")}
              />
              {errors.email && (
                <FieldError id="email-error">{errors.email}</FieldError>
              )}
            </Field>

            <Field data-invalid={!!errors.username || undefined}>
              <FieldLabel htmlFor="username">Username</FieldLabel>
              <Input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                ref={(el) => {
                  controls.current.username = el
                }}
                value={values.username}
                disabled={disabled}
                onChange={(e) => update("username", e.target.value)}
                aria-invalid={!!errors.username || undefined}
                aria-describedby={describedBy(
                  errors.username && "username-error"
                )}
              />
              {errors.username && (
                <FieldError id="username-error">{errors.username}</FieldError>
              )}
            </Field>

            <Field data-invalid={!!errors.bio || undefined}>
              <FieldLabel htmlFor="bio">Bio</FieldLabel>
              <FieldDescription id="bio-hint">
                Up to 160 characters.
              </FieldDescription>
              <Textarea
                id="bio"
                name="bio"
                rows={3}
                ref={(el) => {
                  controls.current.bio = el
                }}
                value={values.bio}
                disabled={disabled}
                onChange={(e) => update("bio", e.target.value)}
                aria-invalid={!!errors.bio || undefined}
                aria-describedby={describedBy(
                  "bio-hint",
                  errors.bio && "bio-error"
                )}
              />
              {errors.bio && <FieldError id="bio-error">{errors.bio}</FieldError>}
            </Field>

            <Field data-invalid={!!errors.timeZone || undefined}>
              <FieldLabel htmlFor="timeZone">Time zone</FieldLabel>
              <NativeSelect
                id="timeZone"
                name="timeZone"
                className="w-full"
                ref={(el) => {
                  controls.current.timeZone = el
                }}
                value={values.timeZone}
                disabled={disabled}
                onChange={(e) =>
                  update("timeZone", e.target.value as TimeZone)
                }
                aria-invalid={!!errors.timeZone || undefined}
                aria-describedby={describedBy(
                  errors.timeZone && "timeZone-error"
                )}
              >
                {timeZones.map((zone) => (
                  <NativeSelectOption key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {errors.timeZone && (
                <FieldError id="timeZone-error">{errors.timeZone}</FieldError>
              )}
            </Field>

            <Field
              orientation="horizontal"
              data-invalid={!!errors.productNews || undefined}
            >
              <Checkbox
                id="productNews"
                name="productNews"
                ref={(el) => {
                  controls.current.productNews = el
                }}
                checked={values.productNews}
                disabled={disabled}
                onCheckedChange={(checked) => update("productNews", checked)}
                aria-invalid={!!errors.productNews || undefined}
                aria-describedby={describedBy(
                  errors.productNews && "productNews-error"
                )}
              />
              <FieldLabel htmlFor="productNews" className="font-normal">
                Email me product news
              </FieldLabel>
            </Field>
            {errors.productNews && (
              <FieldError id="productNews-error" className="-mt-3">
                {errors.productNews}
              </FieldError>
            )}
          </FieldGroup>

          {saveFailed && (
            <Alert variant="destructive">
              <AlertTitle>Your changes weren't saved</AlertTitle>
              <AlertDescription>
                We couldn't reach the server. Try again in a moment.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex-wrap justify-end gap-3">
          <p role="status" className="mr-auto text-sm font-medium">
            {status}
          </p>
          <Button
            type="submit"
            disabled={disabled || saving}
            focusableWhenDisabled
            aria-busy={saving}
          >
            {saving && <Spinner data-icon="inline-start" aria-hidden="true" />}
            Save changes
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
