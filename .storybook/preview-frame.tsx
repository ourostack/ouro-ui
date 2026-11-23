import { useLayoutEffect, type ReactNode } from "react";
import type { Decorator } from "@storybook/react-vite";

/** Whether a story's address asks for the preview frame the docs site embeds, which never scrolls. */
export function isPreviewFrame(search: string): boolean {
  return new URLSearchParams(search).get("preview") === "1";
}

function NoScroll({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const style = document.createElement("style");
    style.textContent = "html, body { overflow: hidden !important; }";
    document.head.append(style);
    return () => style.remove();
  }, []);
  return children;
}

/** With `&preview=1` in the story's address, stops the story's document from scrolling inside the docs page's frame. */
export const withPreviewFrame: Decorator = (Story) =>
  isPreviewFrame(window.location.search) ? (
    <NoScroll>
      <Story />
    </NoScroll>
  ) : (
    <Story />
  );
