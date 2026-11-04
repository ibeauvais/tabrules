import type { CompiledMatcher, GroupTarget } from "./matcher.js";
import { catchAllMatcher, exactHostnameMatcher } from "./matchers/hostname.js";
import { regexMatcher } from "./matchers/regex.js";
import type { HostnameRule, RegexRule, Rule } from "./rule.js";

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

export interface CompiledRules {
  match(url: string): GroupTarget | null;
}

export const compileRules = (rules: readonly Rule[]): CompiledRules => {
  const enabledRules = rules.filter((rule) => rule.enabled);
  const hostnameRules = enabledRules.filter(
    (rule): rule is HostnameRule => rule.type === "hostname",
  );
  const regexRules = enabledRules.filter(
    (rule): rule is RegexRule => rule.type === "regex",
  );
  const compiledMatchers: CompiledMatcher[] = [
    exactHostnameMatcher.compile(hostnameRules),
    regexMatcher.compile(regexRules),
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
      for (const matcher of compiledMatchers) {
        const target = matcher.match(parsedUrl);
        if (target) {
          return target;
        }
      }
      return null;
    },
  };
};
