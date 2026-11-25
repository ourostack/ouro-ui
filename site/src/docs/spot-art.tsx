import type { JSX } from "react";

// Ouro's empty-state spot art from the brand library, by day and at night, for a Moment's `art`.

export type SpotName = "empty-week" | "empty-chat" | "empty-call";

export function SpotArt({ name }: { name: SpotName }): JSX.Element {
  const src = (suffix: string) => `/brand/storybook/spot/${name}${suffix}.webp`;
  return (
    <>
      <img src={src("")} width={440} height={440} alt="" decoding="async" className="size-full object-contain dark:hidden" />
      <img src={src("-dark")} width={440} height={440} alt="" decoding="async" className="hidden size-full object-contain dark:block" />
    </>
  );
}
