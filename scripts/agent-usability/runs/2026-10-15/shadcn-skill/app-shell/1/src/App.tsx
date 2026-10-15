import * as React from "react"
import { ChefHatIcon, LogOutIcon, MenuIcon } from "lucide-react"

import { currentUser, signOut } from "@/api/session"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { pages, useHashRoute, type Page } from "@/lib/use-hash-route"

const MAIN_ID = "main-content"

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function SkipLink() {
  return (
    <a
      href={`#${MAIN_ID}`}
      className="sr-only rounded-lg bg-background px-3 py-2 text-sm font-medium text-foreground shadow-md ring-2 ring-ring focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
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

function AppSidebar({ current }: { current: Page }) {
  const { setOpenMobile } = useSidebar()

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <ChefHatIcon className="size-4" aria-hidden="true" />
          </div>
          <span className="font-heading text-sm font-semibold">Cooking app</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main">
          <SidebarGroup>
            <SidebarMenu>
              {pages.map((page) => {
                const isCurrent = page.hash === current.hash
                return (
                  <SidebarMenuItem key={page.hash}>
                    <SidebarMenuButton
                      isActive={isCurrent}
                      render={
                        <a
                          href={page.hash}
                          aria-current={isCurrent ? "page" : undefined}
                        />
                      }
                      onClick={() => setOpenMobile(false)}
                    >
                      <page.icon aria-hidden="true" />
                      <span>{page.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <UserCard />
      </SidebarFooter>
    </Sidebar>
  )
}

function UserCard() {
  const [isSigningOut, setIsSigningOut] = React.useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await signOut()
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex min-w-0 items-center gap-2">
        <Avatar>
          <AvatarFallback className="text-foreground">{initials(currentUser.name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col text-sm leading-tight">
          <span className="truncate font-medium">{currentUser.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {currentUser.email}
          </span>
        </div>
      </div>
      <Button
        variant="outline"
        className="w-full"
        disabled={isSigningOut}
        onClick={handleSignOut}
      >
        {isSigningOut ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <LogOutIcon data-icon="inline-start" aria-hidden="true" />
        )}
        Sign out
      </Button>
    </div>
  )
}

function MobileHeader() {
  const { openMobile, setOpenMobile } = useSidebar()
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const wasOpen = React.useRef(false)

  // When the drawer closes, return focus to the button that opened it.
  React.useEffect(() => {
    if (wasOpen.current && !openMobile) {
      const button = buttonRef.current
      requestAnimationFrame(() => {
        const active = document.activeElement
        if (!active || active === document.body) button?.focus()
      })
    }
    wasOpen.current = openMobile
  }, [openMobile])

  return (
    <header className="sticky top-0 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:hidden">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        aria-expanded={openMobile}
        onClick={() => setOpenMobile(true)}
      >
        <MenuIcon aria-hidden="true" />
        <span className="sr-only">Open navigation</span>
      </Button>
      <span className="font-heading text-sm font-semibold">Cooking app</span>
    </header>
  )
}

function PageView({ page }: { page: Page }) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-8">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {page.name}
      </h1>
      <Empty className="border">
        <EmptyHeader>
          <EmptyDescription>Nothing here yet.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}

export function App() {
  const current = useHashRoute()

  React.useEffect(() => {
    document.title = `${current.name} · Cooking app`
  }, [current])

  return (
    <>
      <SkipLink />
      <SidebarProvider>
        <AppSidebar current={current} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader />
          <SidebarInset id={MAIN_ID} tabIndex={-1} className="outline-none">
            <PageView page={current} />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </>
  )
}
