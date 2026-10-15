import * as React from "react"
import {
  BookOpenIcon,
  ChefHatIcon,
  HomeIcon,
  LogOutIcon,
  MenuIcon,
  SettingsIcon,
  ShoppingCartIcon,
  UtensilsIcon,
  type LucideIcon,
} from "lucide-react"

import { currentUser, signOut } from "@/api/session"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"

interface Page {
  name: string
  hash: string
  icon: LucideIcon
}

const PAGES: Page[] = [
  { name: "Home", hash: "#/", icon: HomeIcon },
  { name: "Recipes", hash: "#/recipes", icon: UtensilsIcon },
  { name: "Cookbooks", hash: "#/cookbooks", icon: BookOpenIcon },
  { name: "Shopping list", hash: "#/shopping-list", icon: ShoppingCartIcon },
  { name: "Settings", hash: "#/settings", icon: SettingsIcon },
]

const MAIN_ID = "main-content"

function pageFromHash(hash: string): Page {
  return PAGES.find((page) => page.hash === hash) ?? PAGES[0]
}

function useCurrentPage() {
  const [page, setPage] = React.useState(() => pageFromHash(window.location.hash))

  React.useEffect(() => {
    const onHashChange = () => setPage(pageFromHash(window.location.hash))
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  React.useEffect(() => {
    document.title = `${page.name} · Cooking app`
  }, [page])

  return page
}

function AppSidebar({ current }: { current: Page }) {
  const { setOpenMobile } = useSidebar()
  const [signingOut, setSigningOut] = React.useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5 font-medium">
          <ChefHatIcon aria-hidden="true" />
          <span>Cooking app</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {PAGES.map((page) => {
                  const isCurrent = page.hash === current.hash
                  return (
                    <SidebarMenuItem key={page.hash}>
                      <SidebarMenuButton
                        isActive={isCurrent}
                        render={
                          <a
                            href={page.hash}
                            aria-current={isCurrent ? "page" : undefined}
                            onClick={() => setOpenMobile(false)}
                          />
                        }
                      >
                        <page.icon aria-hidden="true" />
                        <span>{page.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <div className="flex min-w-0 flex-col px-2 py-1.5 text-sm">
          <span className="truncate font-medium">{currentUser.name}</span>
          <span className="truncate text-muted-foreground">
            {currentUser.email}
          </span>
        </div>
        <Button
          variant="outline"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <LogOutIcon data-icon="inline-start" aria-hidden="true" />
          )}
          Sign out
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}

function MobileHeader() {
  const { setOpenMobile, openMobile } = useSidebar()

  return (
    <header className="sticky top-0 flex h-14 items-center gap-2 border-b bg-background px-4 md:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open navigation"
        aria-expanded={openMobile}
        onClick={() => setOpenMobile(true)}
      >
        <MenuIcon aria-hidden="true" />
      </Button>
      <span className="font-medium">Cooking app</span>
    </header>
  )
}

function SkipLink() {
  return (
    <a
      href={`#${MAIN_ID}`}
      className="sr-only rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground ring-2 ring-ring focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      onClick={(event) => {
        // The hash holds the current page, so move focus without touching it.
        event.preventDefault()
        document.getElementById(MAIN_ID)?.focus()
      }}
    >
      Skip to content
    </a>
  )
}

export function App() {
  const current = useCurrentPage()

  return (
    <>
      <SkipLink />
      {/* On wide screens the column is always shown, so the open state is fixed. */}
      <SidebarProvider open onOpenChange={() => {}}>
        <AppSidebar current={current} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader />
          <main
            id={MAIN_ID}
            tabIndex={-1}
            className="flex flex-1 flex-col gap-6 p-6 outline-none md:p-10"
          >
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {current.name}
            </h1>
            <Empty className="border">
              <EmptyHeader>
                <EmptyDescription>Nothing here yet.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </main>
        </div>
      </SidebarProvider>
    </>
  )
}
