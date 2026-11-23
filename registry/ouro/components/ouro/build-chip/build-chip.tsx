"use client";

import type { JSX, MouseEvent, Ref } from "react";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { Menu, MenuGroup, MenuItem, MenuRadioGroup, MenuRadioItem } from "@/registry/ouro/components/ouro/menu/menu";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-messages";

/** One build in a {@link BuildChip}'s picker. */
export interface BuildChipBuild {
  /** Reported to `onSelect`, and matched against `current`. */
  id: string;
  /** What shows in the trigger and the picker: "Official 1.2.3", or "branch · sha". */
  label: string;
  /** Local edits since the build's own commit, not yet in any build. Adds "+ edits" after the label. @default false */
  dirty?: boolean | undefined;
}

/** How far the running build trails the official one, for {@link BuildChip}'s `skew` prop. */
export interface BuildChipSkew {
  /** What's out of step: "2 commits behind main". Shown above the fix, never in a warning tone. */
  message: string;
  /** The fix's label: "Update". */
  fixLabel: string;
  /** Runs the fix a person chooses. The chip does not close itself; `onFix` does, by changing `current`. */
  onFix: (event: MouseEvent<HTMLElement>) => void;
}

/** The words {@link BuildChip} says, for apps in other languages. */
export interface BuildChipLabels {
  /** Names the picker for screen readers; a sighted person reads it as the trigger's own text. @default "Build" */
  group?: string | undefined;
  /** Appended to a dirty build's label. @default "+ edits" */
  dirty?: string | undefined;
}

/** Props for {@link BuildChip}. */
export interface BuildChipProps {
  /** Every build the picker offers, official first: the official one and the builds serving now. */
  builds: readonly BuildChipBuild[];
  /** The id, from `builds`, of the build this window is running. */
  current: string;
  /** How far behind the official build `current` is, with its fix. Omit when there is none. */
  skew?: BuildChipSkew | undefined;
  /** Called with a build's id when a person chooses it from the picker. */
  onSelect?: ((id: string) => void) | undefined;
  /** The words, for another language. */
  labels?: BuildChipLabels | undefined;
  /** Layout only: margins, placement (`ms-auto`). Appearance classes warn in development. */
  className?: string | undefined;
  /** Reaches the root. */
  ref?: Ref<HTMLDivElement> | undefined;

  /** Not a prop. Ouro UI says `builds`: `<BuildChip builds={[...]} current="id">`. */
  options?: { 'Use <BuildChip builds={[...]} current="id">': never };
}

const words = { group: "Build", dirty: "+ edits" };

/** A build's label, with "+ edits" after it when it is dirty. */
function buildLabel(build: BuildChipBuild, dirtyWord: string): string {
  return build.dirty ? `${build.label} ${dirtyWord}` : build.label;
}

/**
 * A compact, neutral chip for the title bar, like Xcode's scheme and activity area: it names the
 * build the window runs ("Official 1.2.3", or "branch · sha" with "+ edits" for local changes not
 * yet in any build), and opens a picker of the official build plus the builds serving now so a
 * person is always one choice from the official build. A `skew` line reads how far behind the
 * current build is and offers its fix, in the same neutral tone as the rest of the chip — never a
 * warning, since running another build is routine, not an error.
 *
 * Use `Badge` instead for a status label with no picker, and `Menu` directly for an actions list
 * that isn't a choice of running builds.
 *
 * @group Feedback
 * @see https://ui.ouroboros.bot/docs/build-chip
 *
 * @example
 * <BuildChip
 *   builds={[{ id: "official", label: "Official 1.2.3" }, { id: "w1", label: "feature/x · a1b2c3d", dirty: true }]}
 *   current="w1"
 *   skew={{ message: "2 commits behind main", fixLabel: "Update", onFix: rebase }}
 *   onSelect={switchTo}
 * />
 */
export function BuildChip(props: BuildChipProps): JSX.Element {
  const {
    builds,
    current,
    skew,
    onSelect,
    labels,
    className,
    ref,
    // Guard props (hint types), dropped here so they never reach the DOM.
    options,
  } = props;
  void options;
  const group = labels?.group ?? words.group;
  const dirtyWord = labels?.dirty ?? words.dirty;
  const active = builds.find((build) => build.id === current);
  useAppearanceClassNameCheck(
    "BuildChip",
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => `remove "${token}"; BuildChip takes its colors from the theme`
      : // Stryker disable next-line StringLiteral: the production branch never runs under test
        /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    "BuildChip",
    process.env.NODE_ENV !== "production"
      ? () => [
          builds.length === 0 && ["builds is empty, so there is nothing to choose", '<BuildChip builds={[{ id: "official", label: "Official 1.2.3" }]} current="official" />'],
          builds.length > 0 && active === undefined && [`current="${current}" is not in builds, so the trigger shows no build`, "<BuildChip builds={builds} current={builds[0].id} />"],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );
  return (
    <div ref={ref} data-ouro="build-chip" data-slot="build-chip" className={cn("inline-flex", className)}>
      <Menu
        trigger={
          <Button variant="soft" tone="secondary" size="sm" data-ouro-control="build-chip" data-ouro-part="trigger">
            {active ? buildLabel(active, dirtyWord) : current}
          </Button>
        }
      >
        <MenuRadioGroup label={group} value={current} onValueChange={onSelect}>
          {builds.map((build) => (
            <MenuRadioItem key={build.id} value={build.id}>
              {buildLabel(build, dirtyWord)}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        {skew && (
          <MenuGroup label={skew.message}>
            <MenuItem onClick={skew.onFix}>{skew.fixLabel}</MenuItem>
          </MenuGroup>
        )}
      </Menu>
    </div>
  );
}
