import {
  CATCH_ALL_PATTERN,
  isTabGroupColor,
  type HostnameRule,
  type Rule,
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
const HOSTNAME_RULE_KEYS = new Set([
  "id",
  "type",
  "pattern",
  "groupTitle",
  "color",
  "enabled",
]);

type UnknownRecord = Record<string, unknown>;

const isPlainObject = (value: unknown): value is UnknownRecord => {
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

const parseHostnameRule = (
  record: UnknownRecord,
  path: string,
  errors: string[],
): HostnameRule | null => {
  const errorCountBefore = errors.length;
  const { id, pattern, groupTitle, color, enabled } = record;

  for (const key of Object.keys(record)) {
    if (!HOSTNAME_RULE_KEYS.has(key)) {
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
  if (typeof pattern !== "string" || !isValidHostnamePattern(pattern)) {
    errors.push(
      `${path}.pattern: must be "${CATCH_ALL_PATTERN}" or a lowercase hostname`,
    );
  }
  if (groupTitle !== undefined) {
    if (pattern === CATCH_ALL_PATTERN) {
      errors.push(
        `${path}.groupTitle: not allowed on the catch-all rule (title is the hostname)`,
      );
    } else if (
      typeof groupTitle !== "string" ||
      groupTitle.length > LIMITS.maxGroupTitleLength ||
      CONTROL_CHARACTERS.test(groupTitle)
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
  const rule: HostnameRule = { id, type: "hostname", pattern, enabled };
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
  if (value.type === "hostname") {
    return parseHostnameRule(value, path, errors);
  }
  errors.push(`${path}.type: unknown rule type`);
  return null;
};

const findDuplicates = (
  rules: readonly Rule[],
  field: "id" | "pattern",
): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const rule of rules) {
    const value = rule[field];
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates].map((value) => `rules: duplicate ${field} "${value}"`);
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
    ...findDuplicates(rules, "id"),
    ...findDuplicates(rules, "pattern"),
  );

  return errors.length > 0 ? { ok: false, errors } : { ok: true, rules };
};
