import type { Rule, TabGroupColor } from "./rule.js";

export interface GroupTarget {
  key: string;
  title: string;
  color?: TabGroupColor;
}

export interface RankedRule<R extends Rule> {
  rule: R;
  priority: number;
}

export interface Candidate {
  priority: number;
  target: GroupTarget;
}

export interface CompiledMatcher {
  match(url: URL): Candidate | null;
}

export interface RuleMatcher<R extends Rule> {
  compile(rankedRules: readonly RankedRule<R>[]): CompiledMatcher;
}

export const hostnameOf = (url: URL): string => url.hostname.replace(/\.$/, "");

export const candidate = (
  { rule, priority }: RankedRule<Rule>,
  key: string,
  title: string,
): Candidate => ({
  priority,
  target:
    rule.color === undefined
      ? { key, title }
      : { key, title, color: rule.color },
});
