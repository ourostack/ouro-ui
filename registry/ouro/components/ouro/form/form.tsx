"use client";

import { Form as BaseForm } from "@base-ui/react/form";
import { useCallback, useMemo, useState, type JSX, type ReactNode } from "react";
import { useAppearanceClassNameCheck } from "@/registry/ouro/lib/ouro/class-name-check";
import { cn } from "@/registry/ouro/lib/ouro/cn";
import { useDevWarnings } from "@/registry/ouro/lib/ouro/use-dev-warnings";
import { FormErrorsContext } from "@/registry/ouro/lib/ouro/use-field";

/** Errors by field name: one message, or several. A React Router action returns this shape. */
export type FormErrors = Record<string, string | string[]>;

/** Props for {@link Form}: a `<form>`'s attributes, `errors`, and Base UI Form's `render`. */
export type FormProps = Omit<BaseForm.Props, "className" | "errors" | "children"> & {
  /**
   * Errors by field name, usually from your server action: `errors={actionData?.errors}`.
   * Each one shows on the field with that `name`, which gets `aria-invalid` and links the
   * message, in the server HTML too. A field's own `error` prop wins over it, and a message
   * goes away once the user changes that field. After a submit, focus moves to the first
   * invalid field in the page.
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
 * A form that validates with the browser's own constraints (`required`, `type="email"`,
 * `pattern`) and shows server errors on the matching fields. Pass `errors` straight from
 * your action; each message lands on the field with that `name`, and after a submit focus
 * moves to the first invalid field. It renders a `<form>`, so `action` and `method` pass
 * through; to submit through React Router, render its `Form`: `render={<RouterForm />}`.
 *
 * Use `EditSheet` instead for a form in a dialog that saves and closes, and a plain
 * `<form>` when nothing needs validating.
 *
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
  useDevWarnings(
    "Form",
    process.env.NODE_ENV !== "production"
      ? () => [validationErrors !== undefined && ["validationErrors is not a prop", "<Form errors={actionData?.errors}>"]]
      : /* istanbul ignore next @preserve -- production only */ undefined,
  );

  // The errors the fields show: the prop, less the fields the user has changed since. A new
  // errors object (the next action's result) replaces them all, during render, so the
  // server HTML and the first client render agree.
  const [errors, setErrors] = useState(errorsProp);
  const [source, setSource] = useState(errorsProp);
  if (errorsProp !== source) {
    setSource(errorsProp);
    setErrors(errorsProp);
  }
  const clear = useCallback((name: string) => {
    setErrors((current) => {
      if (!current || !Object.hasOwn(current, name)) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }, []);
  const value = useMemo(() => ({ errors: errors ?? EMPTY, clear }), [errors, clear]);

  return (
    <FormErrorsContext.Provider value={value}>
      {/* Base UI's Form gets the same errors: it blocks a submit while a field is invalid and,
          after a submit, focuses the first invalid control when errors arrive. */}
      <BaseForm {...rest} errors={errors ?? undefined} data-ouro="form" className={cn("m-0 grid min-w-0 gap-5", className)}>
        {children}
      </BaseForm>
    </FormErrorsContext.Provider>
  );
}
