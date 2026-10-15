import { AccountSettingsForm } from "@/components/account-settings-form"

export function App() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <h1 className="font-heading text-2xl font-semibold">Account settings</h1>
      <AccountSettingsForm />
    </main>
  )
}
