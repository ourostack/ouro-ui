const CLASS_PATTERN = /\.(-?[_a-zA-Z][\w-]*|\\.[^\s,.#:[>+~)]*)/g;
const INPUT_PATTERN =
  /radius|border|outline|shadow|background|corner|color|--|width|height|padding/;

const collect = (
  rules: CSSRuleList,
  into: Set<string>,
  depth: number
): void => {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      if (INPUT_PATTERN.test(rule.style.cssText)) {
        for (const match of rule.selectorText.matchAll(CLASS_PATTERN)) {
          into.add((match[1] ?? "").replaceAll("\\", ""));
        }
      }
    } else if (depth < 4 && "cssRules" in rule) {
      collect(rule.cssRules as CSSRuleList, into, depth + 1);
    }
  }
};

/**
 * Class names that some stylesheet rule uses while declaring something the
 * corner geometry reads (radius, border, colors, custom properties). A class
 * toggle on a name outside this set cannot change a corner.
 */
export const readInputClasses = (doc: Document): Set<string> => {
  const names = new Set<string>();
  for (const sheet of doc.styleSheets) {
    try {
      collect(sheet.cssRules, names, 0);
    } catch {
      // Cross-origin sheet: unreadable, so treat every class as an input.
      return new Set(["*"]);
    }
  }
  return names;
};

export const classTokens = (value: string | null): Set<string> =>
  new Set((value ?? "").split(/\s+/).filter(Boolean));

/** True when the class change from `before` to `after` may alter a corner input. */
export const classChangeMatters = (
  inputs: Set<string>,
  before: string | null,
  after: string | null
): boolean => {
  if (inputs.has("*")) {
    return true;
  }
  const was = classTokens(before);
  const now = classTokens(after);
  for (const token of was) {
    if (!now.has(token) && inputs.has(token)) {
      return true;
    }
  }
  for (const token of now) {
    if (!was.has(token) && inputs.has(token)) {
      return true;
    }
  }
  return false;
};
