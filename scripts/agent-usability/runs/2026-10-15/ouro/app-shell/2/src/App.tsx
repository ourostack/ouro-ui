import { useEffect, useState, type MouseEvent } from "react";
import { BookOpen, ChefHat, House, Library, Settings, ShoppingCart } from "lucide-react";
import { currentUser, signOut } from "@/api/session";
import { Avatar } from "@/components/ouro/avatar/avatar";
import { Button } from "@/components/ouro/button/button";
import { Sidebar, type SidebarSection } from "@/components/ouro/sidebar/sidebar";
import { SidebarLayout } from "@/components/ouro/sidebar/sidebar-layout";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";
import { pages, useHashRoute } from "@/use-hash-route";

const icons = {
  "/": <House />,
  "/recipes": <BookOpen />,
  "/cookbooks": <Library />,
  "/shopping-list": <ShoppingCart />,
  "/settings": <Settings />,
};

function Account() {
  const [signingOut, setSigningOut] = useState(false);
  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };
  return (
    <div className="grid w-full min-w-0 gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <Avatar name={currentUser.name} alt="" size="sm" />
        <div className="min-w-0">
          <Text as="span" size="sm" truncate className="block">
            {currentUser.name}
          </Text>
          <Text as="span" size="sm" tone="muted" truncate className="block">
            {currentUser.email}
          </Text>
        </div>
      </div>
      <Button variant="outline" tone="secondary" size="sm" fullWidth loading={signingOut} loadingLabel="Signing out" onClick={onSignOut}>
        Sign out
      </Button>
    </div>
  );
}

export function App() {
  const page = useHashRoute();

  useEffect(() => {
    document.title = `${page.title} · Cooking app`;
  }, [page]);

  const sections: SidebarSection[] = [
    {
      items: pages.map((item) => ({
        label: item.title,
        href: `#${item.path}`,
        icon: icons[item.path],
        current: item.path === page.path,
      })),
    },
  ];

  // The skip link points at the main area's id. Keep that anchor out of the URL hash, which
  // holds the route; the layout still moves focus to the main area.
  const keepRouteInHash = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as Element).closest("a[href^='#']");
    if (link !== null && !link.getAttribute("href")!.startsWith("#/")) event.preventDefault();
  };

  return (
    <div className="contents" onClickCapture={keepRouteInHash}>
      <SidebarLayout
        sidebar={
          <Sidebar
            label="Main"
            menuLabel="Open navigation"
            closeLabel="Close navigation"
            header={
              <span className="flex items-center gap-2 font-semibold">
                <ChefHat aria-hidden="true" className="size-5 shrink-0" />
                Cooking app
              </span>
            }
            sections={sections}
            footer={<Account />}
          />
        }
      >
        <Heading level={1}>{page.title}</Heading>
        <Text tone="muted" className="mt-2">
          Nothing here yet.
        </Text>
      </SidebarLayout>
    </div>
  );
}
