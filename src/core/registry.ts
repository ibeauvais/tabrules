import type {
  Candidate,
  CompiledMatcher,
  GroupTarget,
  RankedRule,
} from "./matcher.js";
import { catchAllMatcher, exactHostnameMatcher } from "./matchers/hostname.js";
import { regexMatcher } from "./matchers/regex.js";
import type { HostnameRule, RegexRule, Rule } from "./rule.js";

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

export interface CompiledRules {
  match(url: string): GroupTarget | null;
}

const isRankedOfType =
  <R extends Rule>(type: R["type"]) =>
  (ranked: RankedRule<Rule>): ranked is RankedRule<R> =>
    ranked.rule.type === type;

export const compileRules = (rules: readonly Rule[]): CompiledRules => {
  const rankedRules = rules
    .map((rule, priority) => ({ rule, priority }))
    .filter(({ rule }) => rule.enabled);
  const hostnameRules = rankedRules.filter(
    isRankedOfType<HostnameRule>("hostname"),
  );
  const compiledMatchers: CompiledMatcher[] = [
    exactHostnameMatcher.compile(hostnameRules),
    regexMatcher.compile(
      rankedRules.filter(isRankedOfType<RegexRule>("regex")),
    ),
    catchAllMatcher.compile(hostnameRules),
  ];

  return {
    match(url) {
      if (!URL.canParse(url)) {
        return null;
      }
      const parsedUrl = new URL(url);
      if (!SUPPORTED_PROTOCOLS.has(parsedUrl.protocol)) {
        return null;
      }
      let best: Candidate | null = null;
      for (const matcher of compiledMatchers) {
        const found = matcher.match(parsedUrl);
        if (found && (best === null || found.priority < best.priority)) {
          best = found;
        }
      }
      return best?.target ?? null;
    },
  };
};
