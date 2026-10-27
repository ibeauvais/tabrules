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
  readonly type: R["type"];
  compile(rules: readonly R[]): CompiledMatcher;
}
