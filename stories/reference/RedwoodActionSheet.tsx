/*
 * Story-only reference: a port of RedwoodUI's ActionSheet
 * (https://github.com/arimendelow/RedwoodUI/blob/main/web/src/ui/ActionSheet/ActionSheet.tsx),
 * Ari's own component, kept here only to compare feel with Ouro UI's Sheet in
 * Storybook. It is not part of the package.
 *
 * Changes from the original, none of which touch the physics:
 * - Imports come from `motion/react` instead of `framer-motion`.
 * - Radix Dialog (not a dependency here) is replaced by a minimal portal shell
 *   with the same jobs: a dialog role, Escape and outside press to close.
 * - RedwoodUI's `dialog-overlay`, `dialog-content` and `bg-default` classes are
 *   inlined as styles over Ouro UI's theme variables.
 * The drag (axis, constraints, default elastic), the inertia snap-back, the
 * overlay opacity bound to the position, the 0.5s tween and the close rule
 * (75% of the screen or any release velocity over 10 px/s) are unchanged.
 */
import {
  AnimatePresence,
  motion,
  useAnimate,
  useMotionValue,
  useTransform,
  useWillChange,
  type BoundingBox,
  type MotionStyle,
  type PanInfo,
} from "motion/react";
import { useEffect, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";

/** Internal per-side values, as in the original. */
interface ActionSheetConfig {
  drag: "y" | "x";
  positionCSS: CSSProperties;
  sizeCSS: CSSProperties;
  /** The block past the edge that makes a pulled sheet look like it is stretching. */
  overflowCSS?: CSSProperties;
  startValue: number;
  endValue: number;
  dragConstraints: Partial<BoundingBox>;
  isClosing: (info: PanInfo) => boolean;
}

export interface RedwoodActionSheetProps {
  /** Height (top or bottom) or width (left or right) in pixels. */
  size: number;
  /** Opens the sheet; the click is handled for you. */
  openButton: ReactNode;
  side: "top" | "bottom" | "left" | "right";
  /** Accessible name, standing in for the Radix Dialog title. */
  label: string;
  open?: boolean;
  setOpen?: Dispatch<SetStateAction<boolean>>;
  children: ReactNode;
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 999,
  backgroundColor: "rgb(64 64 64 / 0.8)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
};

const contentStyle: CSSProperties = {
  position: "absolute",
  zIndex: 1000,
  background: "var(--ouro-color-surface)",
  color: "var(--ouro-color-ink)",
  boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  outline: "none",
};

export function RedwoodActionSheet({
  size,
  openButton,
  side,
  label,
  open: openControlled,
  setOpen: setOpenControlled,
  children,
}: RedwoodActionSheetProps) {
  const [openUncontrolled, setOpenUncontrolled] = useState(false);
  if ((openControlled !== undefined) !== (setOpenControlled !== undefined)) {
    throw new Error("You must pass in both `open` and `setOpen`, or neither.");
  }
  const open = openControlled ?? openUncontrolled;
  const setOpen = setOpenControlled ?? setOpenUncontrolled;

  const [scope, animate] = useAnimate();
  const willChange = useWillChange();

  const staticTransition = { duration: 0.5, ease: [0.32, 0.72, 0, 1] as const };

  const config: ActionSheetConfig = (() => {
    switch (side) {
      case "bottom":
        return {
          drag: "y",
          positionCSS: { top: `calc(100vh - ${size}px)`, left: 0, right: 0 },
          sizeCSS: { height: size },
          overflowCSS: { top: size - 1, width: "100%", height: "100vh" },
          startValue: size,
          endValue: 0,
          dragConstraints: { top: 0 },
          isClosing: (info) => info.offset.y > window.innerHeight * 0.75 || info.velocity.y > 10,
        };
      case "top":
        return {
          drag: "y",
          positionCSS: { top: 0, left: 0, right: 0 },
          sizeCSS: { height: size },
          overflowCSS: { bottom: size - 1, width: "100%", height: "100vh" },
          startValue: -size,
          endValue: 0,
          dragConstraints: { bottom: 0 },
          isClosing: (info) => info.offset.y < window.innerHeight * -0.75 || info.velocity.y < -10,
        };
      case "left":
        return {
          drag: "x",
          positionCSS: { top: 0, left: 0, bottom: 0 },
          sizeCSS: { width: size },
          overflowCSS: { right: size - 1, width: "100vh", height: "100%" },
          startValue: -size,
          endValue: 0,
          dragConstraints: { right: 0 },
          isClosing: (info) => info.offset.x < window.innerWidth * -0.75 || info.velocity.x < -10,
        };
      case "right":
        return {
          drag: "x",
          positionCSS: { top: 0, right: 0, bottom: 0 },
          sizeCSS: { width: size },
          overflowCSS: { left: size - 1, width: "100vh", height: "100%" },
          startValue: size,
          endValue: 0,
          dragConstraints: { left: 0 },
          isClosing: (info) => info.offset.x > window.innerWidth * 0.75 || info.velocity.x > 10,
        };
    }
  })();

  const position = useMotionValue(config.startValue);
  const overlayOpacity = useTransform(position, [config.endValue, config.startValue], [1, 0]);

  // Stand-in for Radix Dialog's Escape handling.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  return (
    <>
      <span onClick={() => setOpen(true)} style={{ display: "contents" }}>
        {openButton}
      </span>
      {createPortal(
        <AnimatePresence>
          {open && (
            <div key="sheet" data-reference="redwood-action-sheet">
              <motion.div
                style={{ ...overlayStyle, opacity: overlayOpacity, willChange } as MotionStyle}
                onClick={() => setOpen(false)}
              />
              <motion.div
                ref={scope}
                key="content"
                role="dialog"
                aria-modal="true"
                aria-label={label}
                data-reference-sheet=""
                initial={{ [config.drag]: config.startValue }}
                animate={{ [config.drag]: config.endValue }}
                exit={{ [config.drag]: config.startValue }}
                transition={staticTransition}
                style={
                  {
                    ...contentStyle,
                    [config.drag]: position,
                    ...config.sizeCSS,
                    ...config.positionCSS,
                    willChange,
                  } as MotionStyle
                }
                drag={config.drag}
                dragConstraints={config.dragConstraints}
                onDragEnd={(_event, info) => {
                  if (config.isClosing(info)) {
                    setOpen(false);
                  } else {
                    void animate(position, config.endValue, {
                      type: "inertia",
                      bounceStiffness: 300,
                      bounceDamping: 40,
                      timeConstant: 300,
                      min: 0,
                      max: 0,
                    });
                  }
                }}
              >
                {/* Extends past the edge of the screen, so a sheet dragged away from it looks like it is stretching. */}
                <div
                  style={{ position: "absolute", zIndex: 1000, background: "var(--ouro-color-surface)", ...config.overflowCSS }}
                />
                {children}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
