import { AccountSettingsForm } from "@/AccountSettingsForm"

export function App() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 sm:py-12">
      <title>Account settings</title>
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Account settings</h1>
        <p className="text-sm text-muted-foreground">
          Change how you appear to other cooks and how we contact you.
        </p>
      </header>
      <AccountSettingsForm />
    </main>
  )
}
