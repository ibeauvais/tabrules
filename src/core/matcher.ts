import type { Rule, TabGroupColor } from "./rule.js";

export interface GroupTarget {
  key: string;
  title: string;
  color?: TabGroupColor;
}

export interface CompiledMatcher {
  match(url: URL): GroupTarget | null;
}

export interface RuleMatcher<R extends Rule> {
  compile(rules: readonly R[]): CompiledMatcher;
}

export const hostnameOf = (url: URL): string => url.hostname.replace(/\.$/, "");

export const groupTarget = (
  key: string,
  title: string,
  rule: Rule,
): GroupTarget =>
  rule.color === undefined ? { key, title } : { key, title, color: rule.color };
