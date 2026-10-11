"use client";

import { Field as BaseField } from "@base-ui/react/field";
import { useId, useMemo, useRef, type JSX, type ReactNode } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { FieldContext, useFieldOwner } from "@/registry/ouro/lib/ouro/use-field";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import { FieldDescription, FieldError, FieldLabel } from "@/registry/ouro/components/ouro/field/field-parts";
import { fieldHint, rootClass } from "@/registry/ouro/components/ouro/field/field-styles";

/**
 * The props every Ouro form control takes, with these exact names: a required `label`,
 * `description`, `error`, `required`, `disabled` and `name`.
 */
export interface FieldProps {
  /**
   * What the control is for, shown above it and read as its name. Required: every control
   * needs a name. To hide it visually, keep it and add `hideLabel`.
   */
  label: string;
  /** Hides the label visually; screen readers still read it as the control's name. */
  hideLabel?: boolean | undefined;
  /** Supporting text under the label, read after the label through `aria-describedby`. */
  description?: ReactNode | undefined;
  /**
   * What is wrong, from your server action or client check. A message (or several, as a
   * list, each shown once) shows under the control, which gets `aria-invalid` and points at the message
   * with `aria-describedby`. An empty string or array means valid.
   */
  error?: string | string[] | undefined;
  /** The control must be filled: it gets `required` and `aria-required`, and the label a marker. */
  required?: boolean | undefined;
  /** Disables the control and fades the field. */
  disabled?: boolean | undefined;
  /**
   * The form field name the control submits under. A Base UI `Form`'s `errors` for this
   * name show here without an `error` prop.
   */
  name?: string | undefined;
  /** The control: `<FieldControl />`, or `<FieldControl render={<textarea />} />` for another element. */
  children: ReactNode;
  /**
   * Layout only: margins, width, grid placement (`mt-4`, `col-span-2`). Appearance
   * classes warn in development; style fields in your theme.
   */
  className?: string | undefined;

  /** Not a prop. Field connects the label to its control itself: `<Field label="Email"><FieldControl /></Field>`. */
  htmlFor?: { 'Field connects the label itself: <Field label="Email"><FieldControl /></Field>': never };
  /** Not a prop. Ouro UI uses `error`: `<Field error="Required.">`. */
  errorMessage?: { 'Use <Field error="Required.">': never };
  /** Not a prop. Ouro UI uses `description`: `<Field description="We never share it.">`. */
  helperText?: { 'Use <Field description="...">': never };
  /** Not a prop. `error` marks the field invalid: `<Field error="What is wrong">`. */
  isInvalid?: { 'Use <Field error="What is wrong">': never };
  /** Not a prop. `error` marks the field invalid: `<Field error="What is wrong">`. */
  invalid?: { 'Use <Field error="What is wrong">': never };
  /** Not a prop. Ouro UI uses `required`: `<Field required>`. */
  isRequired?: { 'Use <Field required>': never };
  /** Not a prop. Ouro UI uses `disabled`: `<Field disabled>`. */
  isDisabled?: { 'Use <Field disabled>': never };
  /** Not a prop, and not a label. Pass `label`, and a placeholder example on the control: `<FieldControl placeholder="you@example.com" />`. */
  placeholder?: { 'Use label="Email"; a placeholder example goes on the control': never };
}

/** The messages in an `error` prop, without empty ones or repeats (merged validators can repeat one). */
function messagesOf(error: string | string[] | undefined): string[] {
  if (error === undefined) return [];
  return [...new Set(Array.isArray(error) ? error : [error])].filter((message) => message !== "");
}

/** The label is connected when its `for` names an element inside the field. Development only. */
function labelConnected(root: HTMLElement, data: string): boolean {
  const target = root.querySelector("label")?.htmlFor;
  /* istanbul ignore next @preserve -- Field always renders a label with a for */
  if (!target) return false;
  return root.ownerDocument.getElementById(target)?.closest(`[data-ouro="${data}"]`) === root;
}

/**
 * A labeled form control: the label, an optional description, the control and its error,
 * wired together with ids that match between the server and the browser. Every Ouro form
 * control takes these props and is built on the same parts.
 *
 * Pass `error` straight from a server action or a client check: it shows the message and
 * sets `aria-invalid`. The control is `FieldControl`, from `field-parts`. Use `Fieldset` instead to group several controls under one legend,
 * and the `FieldRoot` parts when the label, control and error need another layout.
 *
 * @see https://ourostack.github.io/ouro-ui/docs/field
 *
 * @example
 * <Field label="Email" name="email" required description="We never share it." error={errors?.email}>
 *   <FieldControl type="email" autoComplete="email" />
 * </Field>
 */
export function Field(props: FieldProps): JSX.Element {
  const {
    label,
    hideLabel,
    description,
    error,
    required,
    disabled,
    name,
    children,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    htmlFor,
    errorMessage,
    helperText,
    isInvalid,
    invalid: invalidGuess,
    isRequired,
    isDisabled,
    placeholder,
  } = props;
  const id = useId();
  // A control built on Field (TextField) names itself in the messages and the root.
  const owner = useFieldOwner();
  const messages = messagesOf(error);
  const invalid = messages.length > 0;
  const hasDescription = description !== undefined && description !== null && description !== false && description !== "";
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const describedBy = [hasDescription && descriptionId, invalid && errorId].filter(Boolean).join(" ") || undefined;
  const value = useMemo(() => ({ required: Boolean(required), describedBy }), [required, describedBy]);

  // The dev checks run after render, when the root is in the page and the control has
  // registered its id with the label.
  const rootRef = useRef<HTMLDivElement>(null);

  useAppearanceClassNameCheck(
    owner.name,
    className,
    process.env.NODE_ENV !== "production"
      ? (token: string) => fieldHint(token, owner.name)
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  useDevWarnings(
    owner.name,
    process.env.NODE_ENV !== "production"
      ? () => [
          !label && [
            `label is ${label === "" ? "empty" : "missing"}, so the control has no name`,
            `<${owner.name} label="Email" hideLabel> to hide a label you still need`,
          ],
          !labelConnected(rootRef.current!, owner.data) && [
            "the label is not connected to a control",
            `<Field label="${label}"><FieldControl /></Field>, or <FieldControl render={<textarea />} /> for another element`,
          ],
          htmlFor !== undefined && ["htmlFor is not a prop; Field connects the label itself", '<Field label="Email"><FieldControl /></Field>'],
          errorMessage !== undefined && ["errorMessage is not a prop", `<Field error="${String(errorMessage)}">`],
          helperText !== undefined && ["helperText is not a prop", `<Field description="${String(helperText)}">`],
          isInvalid !== undefined && ["isInvalid is not a prop", '<Field error="What is wrong">'],
          invalidGuess !== undefined && ["invalid is not a prop", '<Field error="What is wrong">'],
          isRequired !== undefined && ["isRequired is not a prop", "<Field required>"],
          isDisabled !== undefined && ["isDisabled is not a prop", "<Field disabled>"],
          placeholder !== undefined && [
            "placeholder is not a label",
            '<Field label="Email"><FieldControl placeholder="you@example.com" /></Field>',
          ],
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  return (
    <FieldContext.Provider value={value}>
      <BaseField.Root
        ref={rootRef}
        name={name}
        disabled={disabled}
        invalid={invalid}
        data-ouro={owner.data}
        className={cn(rootClass, className)}
      >
        <FieldLabel className={hideLabel ? "sr-only" : undefined}>{label}</FieldLabel>
        {hasDescription && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
        {children}
        {invalid ? (
          <FieldError id={errorId} match>
            {messages.length > 1 ? (
              <ul>
                {messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : (
              messages[0]
            )}
          </FieldError>
        ) : (
          <FieldError id={errorId} />
        )}
      </BaseField.Root>
    </FieldContext.Provider>
  );
}
