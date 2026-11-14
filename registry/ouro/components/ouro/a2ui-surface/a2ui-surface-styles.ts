import type { LayoutGap } from "@/registry/ouro/components/ouro/stack/stack-styles";

/** The catalog's Stack gaps, on HX's spacing scale. */
export const GAPS: Record<string, LayoutGap> = { none: "none", small: "sm", medium: "md", large: "lg" };

/** The catalog's Badge tones, as HX's theme tokens. */
export const BADGE_TONES: Record<string, "secondary" | "primary" | "success" | "warning" | "destructive"> = { neutral: "secondary", info: "primary", success: "success", warning: "warning", danger: "destructive" };

/** The catalog's Alert tones, as HX's theme tokens. */
export const ALERT_TONES: Record<string, "primary" | "success" | "warning" | "destructive"> = { info: "primary", success: "success", warning: "warning", danger: "destructive" };

/** The catalog's Image aspects, as ratios. */
export const ASPECTS: Record<string, number> = { landscape: 4 / 3, square: 1, portrait: 3 / 4, wide: 16 / 9 };

/** A List's items: the theme's text, a marker inside the column, and HX's small gap between items. */
export const LIST_CLASS = "m-0 grid gap-1 ps-5 text-base text-foreground marker:text-muted-foreground";

/** A value the agent prepared, one line each in a consequential action's confirmation. */
export const FIELD_CLASS = "mt-1 block";

/** The field's label before its value. */
export const FIELD_LABEL_CLASS = "font-medium text-foreground";
