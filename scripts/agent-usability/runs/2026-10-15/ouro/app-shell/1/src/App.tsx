import { useState, useSyncExternalStore, type MouseEvent } from "react";
import { BookOpenIcon, HouseIcon, LibraryIcon, SettingsIcon, ShoppingCartIcon } from "lucide-react";
import { Avatar } from "@/components/ouro/avatar/avatar";
import { Button } from "@/components/ouro/button/button";
import { Sidebar } from "@/components/ouro/sidebar/sidebar";
import { SidebarLayout } from "@/components/ouro/sidebar/sidebar-layout";
import { Stack } from "@/components/ouro/stack/stack";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";
import { currentUser, signOut } from "@/api/session";

const pages = [
  { label: "Home", href: "#/", icon: <HouseIcon /> },
  { label: "Recipes", href: "#/recipes", icon: <BookOpenIcon /> },
  { label: "Cookbooks", href: "#/cookbooks", icon: <LibraryIcon /> },
  { label: "Shopping list", href: "#/shopping-list", icon: <ShoppingCartIcon /> },
  { label: "Settings", href: "#/settings", icon: <SettingsIcon /> },
] as const;

type Page = (typeof pages)[number];

/** The page for a location hash; an empty or unknown hash is Home. */
function pageFor(hash: string): Page {
  const href = hash === "" || hash === "#" ? "#/" : hash;
  return pages.find((page) => page.href === href) ?? pages[0];
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function useCurrentPage(): Page {
  return pageFor(useSyncExternalStore(subscribe, () => window.location.hash));
}

function Account() {
  const [pending, setPending] = useState(false);
  const handleSignOut = async () => {
    setPending(true);
    try {
      await signOut();
    } finally {
      setPending(false);
    }
  };
  return (
    <Stack gap="sm" className="w-full py-1">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={currentUser.name} size="sm" />
        <div className="min-w-0 text-sm leading-5">
          <p className="m-0 truncate font-medium text-foreground">{currentUser.name}</p>
          <p className="m-0 truncate text-muted-foreground">{currentUser.email}</p>
        </div>
      </div>
      <Button variant="outline" tone="secondary" size="sm" fullWidth loading={pending} loadingLabel="Signing out" onClick={handleSignOut}>
        Sign out
      </Button>
    </Stack>
  );
}

export function App() {
  const page = useCurrentPage();

  // The skip link points at the main area's id; keep it from replacing the page's hash.
  // SidebarLayout's own click handler still moves focus to the main area.
  const keepRouteHash = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as Element).closest("a");
    const href = link?.getAttribute("href");
    if (href?.startsWith("#") && !href.startsWith("#/")) event.preventDefault();
  };

  return (
    <div onClickCapture={keepRouteHash} className="overflow-x-clip">
      <SidebarLayout
        sidebar={
          <Sidebar
            label="Main"
            menuLabel="Open navigation"
            closeLabel="Close navigation"
            collapsible={false}
            header={<span className="text-lg font-semibold text-foreground">Cooking app</span>}
            sections={[{ items: pages.map((item) => ({ ...item, current: item.href === page.href })) }]}
            footer={<Account />}
          />
        }
      >
        <Stack gap="sm">
          <Heading level={1} size="xl">
            {page.label}
          </Heading>
          <Text tone="muted">Nothing here yet.</Text>
        </Stack>
      </SidebarLayout>
    </div>
  );
}
