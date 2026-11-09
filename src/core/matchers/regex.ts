import { compileHostnameRegex, type HostnameRegex } from "../hostname-regex.js";
import {
  candidate,
  hostnameOf,
  type RankedRule,
  type RuleMatcher,
} from "../matcher.js";
import type { RegexRule } from "../rule.js";

export const regexMatcher: RuleMatcher<RegexRule> = {
  compile(rankedRules) {
    const compiledRules = [...rankedRules]
      .sort((left, right) => left.priority - right.priority)
      .flatMap(
        (ranked): { ranked: RankedRule<RegexRule>; regex: HostnameRegex }[] => {
          const result = compileHostnameRegex(ranked.rule.pattern);
          return result.ok ? [{ ranked, regex: result.regex }] : [];
        },
      );
    return {
      match(url) {
        const hostname = hostnameOf(url);
        const matching = compiledRules.find(({ regex }) =>
          regex.test(hostname),
        );
        return matching
          ? candidate(
              matching.ranked,
              `rule:${matching.ranked.rule.id}`,
              matching.ranked.rule.groupTitle ?? matching.ranked.rule.pattern,
            )
          : null;
      },
    };
  },
};
