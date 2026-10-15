import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { BookOpenIcon, HomeIcon, LibraryIcon, SettingsIcon, ShoppingCartIcon } from "lucide-react";
import { currentUser, signOut } from "@/api/session";
import { Button } from "@/components/ouro/button/button";
import { Sidebar, type SidebarSection } from "@/components/ouro/sidebar/sidebar";
import { SidebarLayout } from "@/components/ouro/sidebar/sidebar-layout";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";

interface Page {
  name: string;
  hash: string;
  icon: ReactNode;
}

const pages: readonly Page[] = [
  { name: "Home", hash: "#/", icon: <HomeIcon /> },
  { name: "Recipes", hash: "#/recipes", icon: <BookOpenIcon /> },
  { name: "Cookbooks", hash: "#/cookbooks", icon: <LibraryIcon /> },
  { name: "Shopping list", hash: "#/shopping-list", icon: <ShoppingCartIcon /> },
  { name: "Settings", hash: "#/settings", icon: <SettingsIcon /> },
];

/** The page for a URL hash; an empty or unknown route is Home. */
function pageFor(hash: string): Page {
  return pages.find((page) => page.hash === hash) ?? pages[0];
}

/** The current page, from the URL hash. Hashes that are not routes (`#main`) leave it as it is. */
function useCurrentPage(): Page {
  const [page, setPage] = useState(() => pageFor(window.location.hash));
  useEffect(() => {
    const onHashChange = () => {
      const { hash } = window.location;
      if (hash === "" || hash.startsWith("#/")) setPage(pageFor(hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return page;
}

function UserFooter() {
  const [signingOut, setSigningOut] = useState(false);
  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm leading-5 font-medium text-foreground">{currentUser.name}</p>
        <Text as="p" size="sm" tone="muted" className="truncate">
          {currentUser.email}
        </Text>
      </div>
      <Button
        variant="outline"
        tone="secondary"
        size="sm"
        loading={signingOut}
        onClick={async () => {
          setSigningOut(true);
          try {
            await signOut();
          } finally {
            setSigningOut(false);
          }
        }}
      >
        Sign out
      </Button>
    </div>
  );
}

export function App() {
  const page = useCurrentPage();

  useEffect(() => {
    document.title = `${page.name} · Cooking app`;
  }, [page]);

  const sections: readonly SidebarSection[] = [
    {
      items: pages.map((item) => ({ label: item.name, href: item.hash, icon: item.icon, current: item === page })),
    },
  ];

  // The skip link points at the main area's id; keep that out of the hash, which holds the route.
  // The link's own handler still moves focus to the main area.
  const keepRouteInHash = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as Element).closest("a");
    const href = link?.getAttribute("href");
    if (href?.startsWith("#") && !href.startsWith("#/")) event.preventDefault();
  };

  return (
    <div onClickCapture={keepRouteInHash}>
      <SidebarLayout
        sidebar={
          <Sidebar
            label="Main"
            menuLabel="Open navigation"
            closeLabel="Close navigation"
            collapsible={false}
            header={
              <span className="text-base font-semibold text-foreground">Cooking app</span>
            }
            sections={sections}
            footer={<UserFooter />}
          />
        }
      >
        <Heading level={1}>{page.name}</Heading>
        <Text className="mt-2">Nothing here yet.</Text>
      </SidebarLayout>
    </div>
  );
}
