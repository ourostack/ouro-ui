/**
 * Where every scrolled box in the page is, as one string. A scroll made by code (a find's smooth scroll to its match) is
 * no animation `getAnimations()` lists, and what follows it (a Jump to latest pill, fading in once the list stops) starts
 * only when it ends, so a settle that reads two equal strings in a row has seen the scrolling stop.
 */
export function scrollPositions(): string {
  const positions: string[] = [];
  for (const element of document.querySelectorAll<HTMLElement>("*")) {
    if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) positions.push(`${element.scrollLeft},${element.scrollTop}`);
  }
  return positions.join(";");
}
