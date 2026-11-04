import { compileHostnameRegex } from "./hostname-regex.js";
import {
  CATCH_ALL_PATTERN,
  isTabGroupColor,
  type Rule,
  type RuleType,
} from "./rule.js";

export const LIMITS = {
  maxRules: 500,
  maxIdLength: 64,
  maxPatternLength: 253,
  maxGroupTitleLength: 100,
} as const;

export type ParseResult =
  { ok: true; rules: Rule[] } | { ok: false; errors: string[] };

const ID_FORMAT = /^[A-Za-z0-9_-]+$/;
const DNS_LABEL = "(?!-)[a-z0-9-]{1,63}(?<!-)";
const DNS_HOSTNAME_FORMAT = new RegExp(`^${DNS_LABEL}(\\.${DNS_LABEL})*$`);
const IPV6_LITERAL_FORMAT = /^\[[0-9a-f:.]+\]$/;
const CONTROL_CHARACTERS = /\p{Cc}/u;
const RULE_KEYS = new Set([
  "id",
  "type",
  "pattern",
  "groupTitle",
  "color",
  "enabled",
]);

type UnknownRecord = Record<string, unknown>;

export const isPlainObject = (value: unknown): value is UnknownRecord => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const isValidHostnamePattern = (pattern: string): boolean =>
  pattern === CATCH_ALL_PATTERN ||
  (pattern.length <= LIMITS.maxPatternLength &&
    (DNS_HOSTNAME_FORMAT.test(pattern) || IPV6_LITERAL_FORMAT.test(pattern)));

export const isValidGroupTitle = (title: string): boolean =>
  title.length <= LIMITS.maxGroupTitleLength && !CONTROL_CHARACTERS.test(title);

export const regexPatternError = (pattern: string): string | null => {
  if (pattern === "") {
    return "must not be empty";
  }
  if (pattern.length > LIMITS.maxPatternLength) {
    return `must be at most ${String(LIMITS.maxPatternLength)} characters`;
  }
  const result = compileHostnameRegex(pattern);
  return result.ok ? null : result.error;
};

const patternError = (type: RuleType, pattern: unknown): string | null => {
  if (typeof pattern !== "string") {
    return "must be a string";
  }
  if (type === "regex") {
    return regexPatternError(pattern);
  }
  return isValidHostnamePattern(pattern)
    ? null
    : `must be "${CATCH_ALL_PATTERN}" or a lowercase hostname`;
};

const parseRuleRecord = (
  type: RuleType,
  record: UnknownRecord,
  path: string,
  errors: string[],
): Rule | null => {
  const errorCountBefore = errors.length;
  const { id, pattern, groupTitle, color, enabled } = record;

  for (const key of Object.keys(record)) {
    if (!RULE_KEYS.has(key)) {
      errors.push(`${path}.${key}: unknown field`);
    }
  }
  if (
    typeof id !== "string" ||
    id.length > LIMITS.maxIdLength ||
    !ID_FORMAT.test(id)
  ) {
    errors.push(
      `${path}.id: must be 1-${String(LIMITS.maxIdLength)} characters among A-Z a-z 0-9 _ -`,
    );
  }
  const invalidPattern = patternError(type, pattern);
  if (invalidPattern !== null) {
    errors.push(`${path}.pattern: ${invalidPattern}`);
  }
  if (groupTitle !== undefined) {
    if (type === "hostname" && pattern === CATCH_ALL_PATTERN) {
      errors.push(
        `${path}.groupTitle: not allowed on the catch-all rule (title is the hostname)`,
      );
    } else if (
      typeof groupTitle !== "string" ||
      !isValidGroupTitle(groupTitle)
    ) {
      errors.push(
        `${path}.groupTitle: must be a string of at most ${String(LIMITS.maxGroupTitleLength)} characters without control characters`,
      );
    }
  }
  if (color !== undefined && !isTabGroupColor(color)) {
    errors.push(`${path}.color: must be a Chrome tab group color`);
  }
  if (typeof enabled !== "boolean") {
    errors.push(`${path}.enabled: must be a boolean`);
  }

  if (
    errors.length > errorCountBefore ||
    typeof id !== "string" ||
    typeof pattern !== "string" ||
    typeof enabled !== "boolean"
  ) {
    return null;
  }
  const rule: Rule = { id, type, pattern, enabled };
  if (typeof groupTitle === "string") {
    rule.groupTitle = groupTitle;
  }
  if (isTabGroupColor(color)) {
    rule.color = color;
  }
  return rule;
};

const parseRule = (
  value: unknown,
  path: string,
  errors: string[],
): Rule | null => {
  if (!isPlainObject(value)) {
    errors.push(`${path}: must be an object`);
    return null;
  }
  if (value.type === "hostname" || value.type === "regex") {
    return parseRuleRecord(value.type, value, path, errors);
  }
  errors.push(`${path}.type: unknown rule type`);
  return null;
};

const findDuplicates = (
  rules: readonly Rule[],
  describe: (rule: Rule) => string,
): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const rule of rules) {
    const description = describe(rule);
    if (seen.has(description)) {
      duplicates.add(description);
    }
    seen.add(description);
  }
  return [...duplicates].map(
    (description) => `rules: duplicate ${description}`,
  );
};

export const parseRules = (input: unknown): ParseResult => {
  if (!Array.isArray(input)) {
    return { ok: false, errors: ["rules: must be an array"] };
  }
  if (input.length > LIMITS.maxRules) {
    return {
      ok: false,
      errors: [`rules: at most ${String(LIMITS.maxRules)} rules are allowed`],
    };
  }

  const errors: string[] = [];
  const rules = input
    .map((value: unknown, index) =>
      parseRule(value, `rules[${String(index)}]`, errors),
    )
    .filter((rule) => rule !== null);
  errors.push(
    ...findDuplicates(rules, (rule) => `id "${rule.id}"`),
    ...findDuplicates(
      rules,
      (rule) => `${rule.type} pattern "${rule.pattern}"`,
    ),
  );

  return errors.length > 0 ? { ok: false, errors } : { ok: true, rules };
};
