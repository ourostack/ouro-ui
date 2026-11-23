import { type ComponentProps } from "react";
import { expectTypeOf } from "vitest";
import { ThemePicker, type ThemePickerProps } from "@/registry/ouro/components/ouro/theme-picker/theme-picker";
import { useThemePreset, type ThemePresetValue } from "@/registry/ouro/lib/ouro/theme-preset";
import { themePresetScript } from "@/registry/ouro/lib/ouro/theme-preset-script";

// Type tests: `pnpm typecheck` compiles this file.

expectTypeOf<{ presets: [{ name: "pearl"; label: "Pearl" }]; label: "Look"; describe: false; className: "ms-auto" }>().toExtend<ThemePickerProps>();
expectTypeOf<Record<never, never>>().not.toExtend<ThemePickerProps>();
expectTypeOf<ComponentProps<typeof ThemePicker>>().toEqualTypeOf<ThemePickerProps>();
expectTypeOf<{ presets: [{ name: "pearl" }] }>().not.toExtend<ThemePickerProps>();
expectTypeOf<{ presets: [{ name: "live"; label: "Sky"; theme: "pearl" }]; presentation: "popover"; size: "md"; value: "live" }>().toExtend<ThemePickerProps>();
expectTypeOf<{ presets: []; presentation: "menu" }>().not.toExtend<ThemePickerProps>();
expectTypeOf<{ presets: []; size: "xl" }>().not.toExtend<ThemePickerProps>();
expectTypeOf<ThemePickerProps["onValueChange"]>().parameter(0).toBeString();

expectTypeOf(useThemePreset).returns.toEqualTypeOf<ThemePresetValue>();
expectTypeOf<ThemePresetValue["setPreset"]>().parameter(0).toBeString();
expectTypeOf(themePresetScript).returns.toBeString();
