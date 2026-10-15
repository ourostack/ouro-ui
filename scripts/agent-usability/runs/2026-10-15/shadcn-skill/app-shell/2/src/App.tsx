import * as React from "react"
import { MenuIcon, SoupIcon } from "lucide-react"
import { cn } from "cn"

import { AppSidebar } from "@/components/app-sidebar"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty"
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar"
import { useHash } from "@/hooks/use-hash"
import { pageForHash } from "@/lib/pages"

const MAIN_ID = "main-content"

function OpenNavigationButton() {
  const { openMobile, setOpenMobile } = useSidebar()

  return (
    <Button
      variant="ghost"
      size="icon"
      className="md:hidden"
      aria-label="Open navigation"
      aria-expanded={openMobile}
      onClick={() => setOpenMobile(true)}
    >
      <MenuIcon aria-hidden="true" />
    </Button>
  )
}

export function App() {
  const page = pageForHash(useHash())
  const mainRef = React.useRef<HTMLElement>(null)

  React.useEffect(() => {
    document.title = `${page.name} · Cooking app`
  }, [page.name])

  return (
    <SidebarProvider open onOpenChange={() => {}}>
      <a
        href={`#${MAIN_ID}`}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
        )}
        onClick={(event) => {
          // The hash holds the current page, so move focus without changing it.
          event.preventDefault()
          mainRef.current?.focus()
        }}
      >
        Skip to content
      </a>
      <AppSidebar currentPage={page} />
      <SidebarInset
        ref={mainRef}
        id={MAIN_ID}
        tabIndex={-1}
        className="min-w-0 outline-none"
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <OpenNavigationButton />
          <h1 className="truncate text-lg font-semibold">{page.name}</h1>
        </header>
        <div className="flex flex-1 flex-col p-4">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SoupIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyDescription>Nothing here yet.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
