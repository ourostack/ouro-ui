import { AccountSettingsForm } from "@/components/account-settings-form"

export function App() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 sm:py-12">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Account settings</h1>
        <p className="text-sm text-muted-foreground">
          Choose how you appear to other cooks and how we contact you.
        </p>
      </header>
      <AccountSettingsForm />
    </main>
  )
}
