import assert from "node:assert/strict";
import { it as nodeIt } from "node:test";
import { isDeepStrictEqual } from "node:util";

// The few Vitest matchers the kit tests use, over node:assert, so the kits' tests run under
// `node --test` with Node's own coverage (scripts/kits.test.mjs) and no browser.

const asymmetric = Symbol("asymmetric");

/** Whether `actual` matches `expected`, where `expected` may hold asymmetric matchers; undefined properties count as absent. */
function matches(actual, expected) {
  if (expected && expected[asymmetric]) return expected.test(actual);
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((item, index) => matches(actual[index], item));
  if (expected && typeof expected === "object" && !(expected instanceof RegExp) && !(expected instanceof Error)) {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)].filter((key) => expected[key] !== undefined || actual[key] !== undefined));
    return [...keys].every((key) => matches(actual[key], expected[key]));
  }
  return isDeepStrictEqual(actual, expected);
}

/** Whether every property of `expected` matches `actual`'s, recursively; extra properties in `actual` are fine. */
function matchesObject(actual, expected) {
  if (expected && expected[asymmetric]) return expected.test(actual);
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((item, index) => matchesObject(actual[index], item));
  if (expected && typeof expected === "object") {
    return Boolean(actual) && typeof actual === "object" && Object.keys(expected).every((key) => matchesObject(actual[key], expected[key]));
  }
  return isDeepStrictEqual(actual, expected);
}

function thrown(run) {
  try {
    run();
  } catch (error) {
    return { error };
  }
  return undefined;
}

function errorMatches(error, expected) {
  if (expected === undefined) return true;
  const message = error instanceof Error ? error.message : String(error);
  if (typeof expected === "string") return message.includes(expected);
  if (expected instanceof RegExp) return expected.test(message);
  if (typeof expected === "function") return error instanceof expected;
  return message === expected.message;
}

const show = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

function matchers(actual, negate) {
  const check = (pass, message) => assert.ok(negate ? !pass : pass, `${negate ? "not " : ""}${message}`);
  return {
    toBe: (expected) => check(Object.is(actual, expected), `expected ${show(actual)} to be ${show(expected)}`),
    toEqual: (expected) => {
      if (!negate && !matches(actual, expected)) assert.deepStrictEqual(actual, expected);
      check(matches(actual, expected), `expected ${show(actual)} to equal ${show(expected)}`);
    },
    toMatchObject: (expected) => check(matchesObject(actual, expected), `expected ${show(actual)} to match ${show(expected)}`),
    toContain: (expected) => check(actual.includes(expected), `expected ${show(actual)} to contain ${show(expected)}`),
    toMatch: (expected) => check(typeof expected === "string" ? actual.includes(expected) : expected.test(actual), `expected ${show(actual)} to match ${expected}`),
    toHaveLength: (expected) => check(actual.length === expected, `expected length ${actual.length} to be ${expected}`),
    toHaveProperty: (key) => check(actual !== null && actual !== undefined && key in Object(actual), `expected ${show(actual)} to have ${key}`),
    toBeUndefined: () => check(actual === undefined, `expected ${show(actual)} to be undefined`),
    toBeNull: () => check(actual === null, `expected ${show(actual)} to be null`),
    toThrow: (expected) => {
      const result = thrown(actual);
      if (negate) return assert.equal(result, undefined, `expected not to throw, threw ${result?.error}`);
      assert.ok(result, "expected to throw");
      assert.ok(errorMatches(result.error, expected), `expected the error ${show(result.error?.message ?? result.error)} to match ${show(expected instanceof RegExp ? String(expected) : expected)}`);
    },
    toHaveBeenCalled: () => check(actual.mock.calls.length > 0, `expected a call, got ${actual.mock.calls.length}`),
    toHaveBeenCalledTimes: (count) => check(actual.mock.calls.length === count, `expected ${count} calls, got ${actual.mock.calls.length}`),
    toHaveBeenCalledWith: (...args) =>
      check(actual.mock.calls.some((call) => matches(call, args)), `expected a call with ${show(args)}, got ${show(actual.mock.calls)}`),
  };
}

/** Vitest's `expect`, for the matchers the kit tests use. */
export function expect(actual) {
  const base = matchers(actual, false);
  return Object.assign(base, {
    not: matchers(actual, true),
    resolves: new Proxy({}, { get: (_, name) => async (...args) => matchers(await actual, false)[name](...args) }),
    rejects: new Proxy(
      {},
      {
        get: (_, name) => async (expected) => {
          let error;
          try {
            await actual;
          } catch (caught) {
            error = caught;
          }
          assert.ok(error !== undefined, "expected the promise to reject");
          assert.equal(name, "toThrow");
          assert.ok(errorMatches(error, expected), `expected the rejection ${show(error?.message)} to match ${show(expected)}`);
        },
      },
    ),
  });
}

expect.stringContaining = (text) => ({ [asymmetric]: true, test: (value) => typeof value === "string" && value.includes(text) });
expect.stringMatching = (pattern) => ({ [asymmetric]: true, test: (value) => typeof value === "string" && new RegExp(pattern).test(value) });
expect.any = (type) => ({ [asymmetric]: true, test: (value) => value !== null && value !== undefined && (value instanceof type || value.constructor === type) });

/** Vitest's `vi.fn`: a function that records its calls, with the mock helpers the kit tests use. */
function fn(implementation = () => undefined) {
  let impl = implementation;
  const mock = function (...args) {
    mock.mock.calls.push(args);
    return impl.apply(this, args);
  };
  mock.mock = { calls: [] };
  mock.mockReturnValue = (value) => {
    impl = () => value;
    return mock;
  };
  mock.mockResolvedValue = (value) => {
    impl = () => Promise.resolve(value);
    return mock;
  };
  mock.mockImplementation = (next) => {
    impl = next;
    return mock;
  };
  return mock;
}

export const vi = { fn };

/** Vitest's `it.each`, over node:test's `it`: one test per case, its title formatted printf-style (%s, %i, %j). */
export function each(cases) {
  return (title, run) => {
    for (const [index, entry] of cases.entries()) {
      const args = Array.isArray(entry) ? entry : [entry];
      let next = 0;
      const name = title.replace(/%[sidjo#%]/g, (token) => (token === "%%" ? "%" : token === "%#" ? String(index) : token === "%j" ? show(args[next++]) : String(args[next++])));
      nodeIt(name, () => run(...args));
    }
  };
}
