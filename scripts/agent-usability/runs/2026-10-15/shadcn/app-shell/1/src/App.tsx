import { useEffect, useRef, useState } from "react";
import { LogOutIcon, MenuIcon } from "lucide-react";

import { currentUser, signOut } from "@/api/session";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/sidebar";
import { pageForHash, pages, type Page } from "@/shell/pages";
import { useHash } from "@/shell/use-hash";

const MAIN_ID = "main-content";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function SkipLink() {
  return (
    <a
      href={`#${MAIN_ID}`}
      onClick={(event) => {
        // The hash holds the current page, so move focus without touching it.
        event.preventDefault();
        document.getElementById(MAIN_ID)?.focus();
      }}
      className="sr-only rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow-md ring-2 ring-ring focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100"
    >
      Skip to content
    </a>
  );
}

function UserFooter() {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <SidebarFooter className="border-t border-sidebar-border">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Avatar aria-hidden="true">
          <AvatarFallback className="text-foreground">{initials(currentUser.name)}</AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 text-sm leading-tight">
          <span className="truncate font-medium">{currentUser.name}</span>
          <span className="truncate text-xs">{currentUser.email}</span>
        </div>
      </div>
      <Button variant="outline" className="w-full" onClick={handleSignOut} aria-busy={signingOut || undefined}>
        <LogOutIcon aria-hidden="true" />
        Sign out
      </Button>
    </SidebarFooter>
  );
}

function AppSidebar({ current }: { current: Page }) {
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <span className="px-2 py-1.5 text-base font-semibold">Cooking app</span>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {pages.map((page) => {
                  const isCurrent = page === current;
                  const Icon = page.icon;
                  return (
                    <SidebarMenuItem key={page.hash}>
                      <SidebarMenuButton
                        render={<a href={page.hash} />}
                        isActive={isCurrent}
                        aria-current={isCurrent ? "page" : undefined}
                        onClick={() => setOpenMobile(false)}
                      >
                        <Icon aria-hidden="true" />
                        <span>{page.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <UserFooter />
    </Sidebar>
  );
}

function MobileHeader() {
  const { openMobile, setOpenMobile } = useSidebar();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    // Whichever way the navigation closes, put focus back on the button that opened it.
    if (wasOpen.current && !openMobile) buttonRef.current?.focus();
    wasOpen.current = openMobile;
  }, [openMobile]);

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-3 md:hidden">
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
      <span className="font-semibold">Cooking app</span>
    </header>
  );
}

function PageView({ page }: { page: Page }) {
  return (
    <div className="flex flex-col gap-2 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{page.name}</h1>
      <p className="text-muted-foreground">Nothing here yet.</p>
    </div>
  );
}

export function App() {
  const hash = useHash();
  const current = pageForHash(hash);

  useEffect(() => {
    document.title = `${current.name} · Cooking app`;
  }, [current]);

  return (
    <SidebarProvider>
      <SkipLink />
      <AppSidebar current={current} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader />
        <main id={MAIN_ID} tabIndex={-1} className="flex-1 outline-none">
          <PageView page={current} />
        </main>
      </div>
    </SidebarProvider>
  );
}
