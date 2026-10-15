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
} from "lucide-react"

import { currentUser, signOut } from "@/api/session"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
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
  useSidebar,
} from "@/components/ui/sidebar"

const PAGES = [
  { hash: "#/", name: "Home", icon: HomeIcon },
  { hash: "#/recipes", name: "Recipes", icon: UtensilsIcon },
  { hash: "#/cookbooks", name: "Cookbooks", icon: BookOpenIcon },
  { hash: "#/shopping-list", name: "Shopping list", icon: ShoppingCartIcon },
  { hash: "#/settings", name: "Settings", icon: SettingsIcon },
] as const

type Page = (typeof PAGES)[number]

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange)
  return () => window.removeEventListener("hashchange", onChange)
}

function getHash() {
  return window.location.hash
}

function useCurrentPage(): Page {
  const hash = React.useSyncExternalStore(subscribeToHash, getHash)
  return PAGES.find((page) => page.hash === hash) ?? PAGES[0]
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function AppSidebar({ currentPage }: { currentPage: Page }) {
  const { setOpenMobile } = useSidebar()
  const [signOutState, setSignOutState] = React.useState<
    "idle" | "pending" | "done"
  >("idle")

  async function handleSignOut() {
    if (signOutState === "pending") return
    setSignOutState("pending")
    await signOut()
    setSignOutState("done")
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5 font-semibold">
          <ChefHatIcon aria-hidden="true" className="size-5" />
          <span>Cooking app</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {PAGES.map((page) => {
                  const isCurrent = page.hash === currentPage.hash
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
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex min-w-0 items-center gap-2 px-2 py-1.5">
          <Avatar>
            <AvatarFallback aria-hidden="true" className="text-foreground">
              {initials(currentUser.name)}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 text-sm leading-tight">
            <span className="truncate font-medium">{currentUser.name}</span>
            <span className="truncate text-xs text-sidebar-foreground/80">
              {currentUser.email}
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full justify-start"
          aria-disabled={signOutState === "pending" || undefined}
          onClick={handleSignOut}
        >
          <LogOutIcon aria-hidden="true" />
          Sign out
        </Button>
        <p role="status" className="px-2 text-xs empty:hidden">
          {signOutState === "pending"
            ? "Signing out…"
            : signOutState === "done"
              ? "Signed out."
              : ""}
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}

function MobileHeader() {
  const { openMobile, setOpenMobile } = useSidebar()
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const wasOpen = React.useRef(false)

  // When the navigation closes, focus goes back to the button that opened it.
  React.useEffect(() => {
    if (wasOpen.current && !openMobile) {
      const id = window.setTimeout(() => buttonRef.current?.focus(), 0)
      wasOpen.current = openMobile
      return () => window.clearTimeout(id)
    }
    wasOpen.current = openMobile
  }, [openMobile])

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4 md:hidden">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        aria-label="Open navigation"
        aria-expanded={openMobile}
        onClick={() => setOpenMobile(true)}
      >
        <MenuIcon aria-hidden="true" />
      </Button>
      <span className="flex items-center gap-2 font-semibold">
        <ChefHatIcon aria-hidden="true" className="size-5" />
        Cooking app
      </span>
    </header>
  )
}

export function App() {
  const currentPage = useCurrentPage()

  React.useEffect(() => {
    document.title = `${currentPage.name} · Cooking app`
  }, [currentPage])

  return (
    <SidebarProvider>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground shadow-md ring-2 ring-ring focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById("main")?.focus()
        }}
      >
        Skip to content
      </a>
      <AppSidebar currentPage={currentPage} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader />
        <main
          id="main"
          tabIndex={-1}
          className="flex flex-1 flex-col gap-2 p-6 outline-none md:p-10"
        >
          <h1 className="text-2xl font-semibold tracking-tight">
            {currentPage.name}
          </h1>
          <p className="text-muted-foreground">Nothing here yet.</p>
        </main>
      </div>
    </SidebarProvider>
  )
}
