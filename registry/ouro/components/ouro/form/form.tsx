"use client";

import { Form as BaseForm } from "@base-ui/react/form";
import { isValidElement, useCallback, useEffect, useMemo, useRef, useState, type JSX, type ReactNode, type Ref } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import { useMergedRef } from "@/registry/ouro/lib/ouro/refs";
import { errorMessageKey, errorMessages, FormErrorsContext, type ErrorMessages } from "@/registry/ouro/lib/ouro/use-field";

/**
 * Errors by field name: one message, or several as an array. A React Router action returns
 * this shape. A message is text or a React node, so it can carry a link. The `form` key holds
 * messages about the whole form.
 */
export type FormErrors = Record<string, ErrorMessages>;

/** Props for {@link Form}: a `<form>`'s attributes, `errors`, and Base UI Form's `render`. */
export type FormProps = Omit<BaseForm.Props, "className" | "errors" | "children"> & {
  /**
   * Errors by field name, usually from your server action: `errors={actionData?.errors}`.
   * Each one shows on the field with that `name`, which gets `aria-invalid` and links the
   * message, in the server HTML too. A field's own `error` prop wins over it, and a message
   * goes away once the user changes that field. When new errors arrive, focus moves to the
   * first field with one, in page order. The `form` key shows in an alert at the top of
   * the form, in the server HTML too; a key no rendered field is named joins it once the
   * page hydrates, and warns in development. A message is text or a React node (a message
   * with a link), and an array is several messages.
   *
   * Errors are compared by content, so an object built while rendering
   * (`errors={{ ...actionData?.errors, form: actionData?.general }}`) is the same errors
   * until its content changes: it shows no cleared message again and moves no focus. After a
   * submit, the next errors the Form is given count as that submit's answer even when they
   * equal the last ones, so a repeated answer shows again.
   *
   * These errors only show: they never block the next submit, so the user can always send
   * the form again (a server error may be fixed by changing another field, or by trying
   * again). The browser's own checks (`required`, `type="email"`) still block a submit.
   */
  errors?: FormErrors | null | undefined;
  /** The fields and the submit button. */
  children: ReactNode;
  /**
   * Layout only: margins, width, grid placement. Fields stack with a gap by default;
   * appearance classes warn in development.
   */
  className?: string | undefined;

  /** Not a prop. Ouro UI uses `errors`: `<Form errors={actionData?.errors}>`. */
  validationErrors?: { 'Use <Form errors={actionData?.errors}>': never };
};

const EMPTY: FormErrors = {};

/**
 * The message at the top of the form, for the `form` key and keys no field claims: the
 * destructive color, with an outline only while focused.
 */
const formMessageClass =
  "grid gap-1 text-sm leading-5 text-destructive outline-ring outline-offset-2 focus-visible:outline-2 focus-visible:outline-solid";

/** The key for a message about the whole form, shown at its top. */
const FORM_KEY = "form";

/** How deep `sameContent` looks before it calls two values different: past any real message, short of a loop. */
const MAX_DEPTH = 40;

/**
 * Whether two error values hold the same content: equal text, arrays and plain objects with
 * equal entries, and React elements of the same type and key with equal props. An app that
 * builds its errors object while rendering passes a new, equal one on every render.
 */
function sameContent(a: unknown, b: unknown, depth = 0): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || depth === MAX_DEPTH) return false;
  if (isValidElement(a) || isValidElement(b)) {
    return isValidElement(a) && isValidElement(b) && a.type === b.type && a.key === b.key && sameContent(a.props, b.props, depth + 1);
  }
  const keys = Object.keys(a);
  return (
    Array.isArray(a) === Array.isArray(b) &&
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && sameContent((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], depth + 1))
  );
}

/**
 * Whether an element takes focus: hidden inputs and hidden copies of a control do not, and
 * neither does a disabled control, which the user cannot change (a disabled checkbox or
 * radio is a `<span aria-disabled>` that would otherwise accept focus).
 */
const focusable = (element: HTMLElement) =>
  !element.matches('input[type="hidden"], [aria-hidden="true"], [hidden], :disabled, [aria-disabled="true"]');

/** In a radio group, the picked radio is the way in, when it can take focus; otherwise the element itself. */
function entryPoint(element: HTMLElement): HTMLElement {
  if (element.getAttribute("role") !== "radio") return element;
  const picked = element.closest('[role="radiogroup"]')!.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]');
  return picked && focusable(picked) ? picked : element;
}

/**
 * A form that validates with the browser's own constraints (`required`, `type="email"`,
 * `pattern`) and shows server errors on the matching fields. Pass `errors` straight from
 * your action; each message lands on the field with that `name`, and focus moves to the
 * first field with an error. Server errors only show: unlike the browser's checks they
 * never block the next submit, so the user can always send the form again. A Form submits
 * only itself: its submit event stops there, so a Form in a sheet inside another Form
 * never submits the outer one. It renders a `<form>`, so `action` and `method` pass
 * through; to submit through React Router, render its `Form`: `render={<RouterForm />}`.
 *
 * Use `EditSheet` instead for a form in a dialog that saves and closes, and a plain
 * `<form>` when nothing needs validating.
 *
 * @group Forms
 * @see https://ourostack.github.io/ouro-ui/docs/form
 *
 * @example
 * const actionData = useActionData<typeof action>();
 * <Form method="post" errors={actionData?.errors} render={<RouterForm />}>
 *   <TextField label="Email" name="email" type="email" required />
 *   <Button type="submit">Save</Button>
 * </Form>
 */
export function Form(props: FormProps): JSX.Element {
  const {
    errors: errorsProp,
    onSubmit,
    children,
    className,
    // Guard props (hint types), dropped here so they never reach the DOM.
    validationErrors,
    ...rest
  } = props;

  useAppearanceClassNameCheck(
    "Form",
    className,
    process.env.NODE_ENV !== "production"
      ? "style fields in your theme (--input, --ring, --radius)"
      : /* istanbul ignore next @preserve -- production only */ "",
  );
  // The errors the fields show: the prop, less the fields the user has changed since. New
  // errors (the next action's result) replace them all, during render, so the server HTML and
  // the first client render agree. Errors are new when their content changed, or when the form
  // was submitted since the last ones: an action that answers a second submit with equal
  // errors is saying it again. An equal object otherwise (one built while rendering) is the
  // same errors: it shows no cleared message again and moves no focus.
  const [submits, setSubmits] = useState(0);
  const [shown, setShown] = useState({ source: errorsProp, errors: errorsProp, submits, arrivals: 0 });
  if (errorsProp !== shown.source && (submits !== shown.submits || !sameContent(errorsProp ?? EMPTY, shown.source ?? EMPTY))) {
    setShown({ source: errorsProp, errors: errorsProp, submits, arrivals: shown.arrivals + 1 });
  }
  const errors = shown.errors;
  const clear = useCallback((name: string) => {
    setShown((current) => {
      if (!current.errors || !Object.hasOwn(current.errors, name)) return current;
      const next = { ...current.errors };
      delete next[name];
      return { ...current, errors: next };
    });
  }, []);

  // The names of the fields in the form, which claim their errors. Fields register once
  // mounted, so the server and the first client render show only the `form` key at the
  // top; keys no field claims (a typo, a field that is not rendered) join it after
  // hydration. A message never shows twice.
  const names = useRef(new Map<string, number>());
  const [claims, setClaims] = useState<{ ready: boolean; names: string[] }>({ ready: false, names: [] });
  const sync = useCallback(() => setClaims({ ready: true, names: [...names.current.keys()] }), []);
  const register = useCallback(
    (name: string) => {
      names.current.set(name, (names.current.get(name) ?? 0) + 1);
      sync();
      return () => {
        const count = names.current.get(name)! - 1;
        if (count === 0) names.current.delete(name);
        else names.current.set(name, count);
        sync();
      };
    },
    [sync],
  );
  useEffect(sync, [sync]);
  const value = useMemo(() => ({ errors: errors ?? EMPTY, clear, register }), [errors, clear, register]);
  const showsAtTop = (key: string) => key === FORM_KEY || (claims.ready && !claims.names.includes(key));

  useDevWarnings(
    "Form",
    process.env.NODE_ENV !== "production"
      ? () => [
          validationErrors !== undefined && ["validationErrors is not a prop", "<Form errors={actionData?.errors}>"],
          ...Object.keys(errorsProp ?? EMPTY)
            .filter((key) => key !== FORM_KEY && !names.current.has(key))
            .map((key) => unclaimedWarning(key, [...names.current.keys()])),
        ]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // When new errors arrive, focus the first field showing one, in page order, or the
  // message at the top when no field has one. Not on the first render: a page that loads
  // with errors leaves focus where the browser puts it.
  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const focusedFor = useRef(shown.arrivals);
  useEffect(() => {
    if (focusedFor.current === shown.arrivals) return;
    focusedFor.current = shown.arrivals;
    if (Object.keys(shown.source ?? EMPTY).length === 0) return;
    const invalid = [...formRef.current!.querySelectorAll<HTMLElement>('[aria-invalid="true"]')].find(focusable);
    (invalid ? entryPoint(invalid) : messageRef.current)?.focus();
  }, [shown.arrivals, shown.source]);

  // A submit stops at its own Form: React bubbles events through portals, so a Form in a
  // sheet would otherwise reach the Form the sheet sits in. It runs only once the browser's
  // checks pass, so it also marks the errors that come next as this submit's answer.
  const submit: NonNullable<BaseForm.Props["onSubmit"]> = (event) => {
    event.stopPropagation();
    setSubmits((count) => count + 1);
    onSubmit?.(event);
  };
  const setFormRef = useMergedRef(rest.ref, formRef);

  return (
    <FormErrorsContext.Provider value={value}>
      {/* Base UI's Form runs the browser's checks: it blocks a submit while a constraint
          fails and focuses the first such control. Ouro's errors never reach it, so they
          never block a submit. */}
      <BaseForm {...rest} ref={setFormRef} onSubmit={submit} data-ouro="form" className={cn("grid min-w-0 gap-5", className)}>
        {/* A new element for each answer, so its alert is announced again. */}
        <FormMessage key={shown.arrivals} ref={messageRef} errors={errors ?? EMPTY} showsAtTop={showsAtTop} />
        {children}
      </BaseForm>
    </FormErrorsContext.Provider>
  );
}

/**
 * The development message for an `errors` key no field in the form is named: the key, the
 * fields there are, and both fixes. Development only.
 */
function unclaimedWarning(key: string, fields: string[]): readonly [string, string] {
  const property = (name: string) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));
  const read = (name: string) => (property(name) === name ? `errors.${name}` : `errors[${property(name)}]`);
  return fields.length === 0
    ? [
        `errors has the key "${key}", but the form has no named field, so the message shows at the top of the form`,
        `a message about the whole form uses the "${FORM_KEY}" key: errors={{ ${FORM_KEY}: ${read(key)} }}`,
      ]
    : [
        `errors has the key "${key}", but the form's fields are named ${fields.join(", ")}, so the message shows at the top of the form`,
        `a message about the whole form uses the "${FORM_KEY}" key: errors={{ ...errors, ${FORM_KEY}: ${read(key)} }}; ` +
          `to pass only this form's errors: errors={{ ${fields.map((name) => `${property(name)}: ${read(name)}`).join(", ")} }}`,
      ];
}

/**
 * The message at the top of the form. It is in the page only while it has a message, and it
 * arrives with the message already in it: an element added with `role="alert"` and its text
 * is what screen readers announce, and a test's `getByRole("alert")` finds a message or nothing.
 */
function FormMessage({
  ref,
  errors,
  showsAtTop,
}: {
  ref: Ref<HTMLDivElement>;
  errors: FormErrors;
  showsAtTop: (key: string) => boolean;
}): JSX.Element | null {
  // The message about the whole form comes first, then the keys no field claims.
  const keys = Object.keys(errors).filter(showsAtTop);
  const messages = [...keys.filter((key) => key === FORM_KEY), ...keys.filter((key) => key !== FORM_KEY)].flatMap((key) =>
    errorMessages(errors[key]),
  );
  if (messages.length === 0) return null;
  return (
    <div ref={ref} role="alert" tabIndex={-1} data-ouro="form-message" className={formMessageClass}>
      {messages.map((message, index) => (
        <p key={errorMessageKey(message, index)} className="m-0">
          {message}
        </p>
      ))}
    </div>
  );
}
