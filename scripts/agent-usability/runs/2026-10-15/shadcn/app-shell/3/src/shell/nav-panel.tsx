import * as React from "react"
import { ChefHatIcon, BookOpenIcon, HomeIcon, LibraryIcon, SettingsIcon, ShoppingCartIcon } from "lucide-react"

import { currentUser, signOut } from "@/api/session"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { pages, type Page } from "@/shell/routes"

const icons: Record<string, React.ComponentType> = {
  "#/": HomeIcon,
  "#/recipes": BookOpenIcon,
  "#/cookbooks": LibraryIcon,
  "#/shopping-list": ShoppingCartIcon,
  "#/settings": SettingsIcon,
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function NavPanel({
  currentPage,
  title,
  onNavigate,
}: {
  currentPage: Page
  /** Replaces the brand line, e.g. with a dialog title. */
  title?: React.ReactNode
  onNavigate?: () => void
}) {
  const [signingOut, setSigningOut] = React.useState(false)

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <>
      <SidebarHeader className="h-14 flex-row items-center gap-2 px-4">
        <ChefHatIcon aria-hidden="true" className="size-5" />
        {title ?? <span className="font-heading text-base font-semibold">Cooking app</span>}
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {pages.map((page) => {
                  const Icon = icons[page.hash]
                  const isCurrent = page.hash === currentPage.hash
                  return (
                    <SidebarMenuItem key={page.hash}>
                      <SidebarMenuButton
                        isActive={isCurrent}
                        render={<a href={page.hash} aria-current={isCurrent ? "page" : undefined} />}
                        onClick={onNavigate}
                      >
                        <Icon aria-hidden="true" />
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
      <SidebarFooter className="gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar aria-hidden="true">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">{initials(currentUser.name)}</AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 text-sm leading-tight">
            <span className="truncate font-medium">{currentUser.name}</span>
            <span className="truncate text-muted-foreground">{currentUser.email}</span>
          </div>
        </div>
        <Button variant="outline" onClick={handleSignOut} aria-busy={signingOut || undefined}>
          Sign out
        </Button>
      </SidebarFooter>
    </>
  )
}
