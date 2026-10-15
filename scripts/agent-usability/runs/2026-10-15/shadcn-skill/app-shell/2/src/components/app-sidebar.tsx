import * as React from "react"
import { ChefHatIcon, LogOutIcon } from "lucide-react"

import { currentUser, signOut } from "@/api/session"
import { pages, type Page } from "@/lib/pages"
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
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"

export function AppSidebar({ currentPage }: { currentPage: Page }) {
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
        <div className="flex h-8 items-center gap-2 px-2 font-medium">
          <ChefHatIcon aria-hidden="true" className="size-4" />
          Cooking app
        </div>
      </SidebarHeader>
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {pages.map((page) => {
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
        </SidebarContent>
      </nav>
      <SidebarSeparator />
      <SidebarFooter>
        <div className="flex min-w-0 flex-col px-2">
          <span className="truncate text-sm font-medium">
            {currentUser.name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {currentUser.email}
          </span>
        </div>
        <Button
          variant="outline"
          disabled={signingOut}
          onClick={handleSignOut}
        >
          {signingOut ? (
            <Spinner data-icon="inline-start" aria-hidden="true" />
          ) : (
            <LogOutIcon data-icon="inline-start" aria-hidden="true" />
          )}
          Sign out
        </Button>
      </SidebarFooter>
    </Sidebar>
  )
}
