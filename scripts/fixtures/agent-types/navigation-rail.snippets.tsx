// What agents write with navigation-rail: snippets whose cases are in navigation-rail.cases.ts.
import { NavigationRail } from "@/registry/ouro/components/ouro/navigation-rail/navigation-rail";

const items = [{ label: "Chat", href: "/chat", icon: <svg /> }];

export const navigationRail01 = <NavigationRail label="Main" items={items} pathname="/chat" />;
export const navigationRail02 = <NavigationRail label="Main" items={[{ label: "Chat", href: "/chat", icon: <svg />, badge: 3 }]} />;
export const navigationRail03 = <NavigationRail label="Main" items={items} selectedId="chat" />;
export const navigationRailOk01 = <NavigationRail label="Main" items={[{ label: "Chat", href: "/chat", icon: <svg />, currentIcon: <svg />, paths: ["/people"], count: 3 }, { type: "separator" }, { label: "Files", onClick: () => {}, icon: <svg />, current: true }]} currentPath="/chat" header={<svg />} footer={<button type="button">Settings</button>} hideLabels countLabel="{count} unread" moreLabel="Others" className="max-sm:hidden" />;
