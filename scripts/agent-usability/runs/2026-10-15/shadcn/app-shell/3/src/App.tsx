import * as React from "react"
import { MenuIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar"
import { useIsMobile } from "@/hooks/use-mobile"
import { NavPanel } from "@/shell/nav-panel"
import { useCurrentPage } from "@/shell/routes"

export function App() {
  const currentPage = useCurrentPage()
  const isMobile = useIsMobile()
  const [navOpen, setNavOpen] = React.useState(false)
  const mainRef = React.useRef<HTMLElement>(null)

  React.useEffect(() => {
    document.title = `${currentPage.name} · Cooking app`
  }, [currentPage])

  function skipToContent(event: React.MouseEvent<HTMLAnchorElement>) {
    // The hash holds the current page, so focus the main area without following the link.
    event.preventDefault()
    mainRef.current?.focus()
  }

  return (
    <SidebarProvider>
      <a
        href="#main"
        onClick={skipToContent}
        className="sr-only z-50 rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground shadow-md ring-2 ring-ring focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      {!isMobile && (
        <Sidebar collapsible="none" className="sticky top-0 hidden h-svh shrink-0 border-r md:flex">
          <NavPanel currentPage={currentPage} />
        </Sidebar>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-2 md:hidden">
          <Sheet open={isMobile && navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open navigation" />}>
              <MenuIcon aria-hidden="true" />
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground"
            >
              <NavPanel
                currentPage={currentPage}
                title={<SheetTitle className="text-base font-semibold">Cooking app</SheetTitle>}
                onNavigate={() => setNavOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <span className="font-heading text-base font-semibold">Cooking app</span>
        </header>

        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 px-4 py-6 outline-none md:px-8 md:py-8"
        >
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{currentPage.name}</h1>
          <p className="mt-2 text-muted-foreground">Nothing here yet.</p>
        </main>
      </div>
    </SidebarProvider>
  )
}
