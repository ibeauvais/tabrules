import { compileHostnameRegex, type HostnameRegex } from "../hostname-regex.js";
import { groupTarget, hostnameOf, type RuleMatcher } from "../matcher.js";
import type { RegexRule } from "../rule.js";

export const regexMatcher: RuleMatcher<RegexRule> = {
  compile(rules) {
    const compiledRules = rules.flatMap(
      (rule): { rule: RegexRule; regex: HostnameRegex }[] => {
        const result = compileHostnameRegex(rule.pattern);
        return result.ok ? [{ rule, regex: result.regex }] : [];
      },
    );
    return {
      match(url) {
        const hostname = hostnameOf(url);
        const matching = compiledRules.find(({ regex }) =>
          regex.test(hostname),
        );
        return matching
          ? groupTarget(
              `rule:${matching.rule.id}`,
              matching.rule.groupTitle ?? matching.rule.pattern,
              matching.rule,
            )
          : null;
      },
    };
  },
};
