import { groupTarget, hostnameOf, type RuleMatcher } from "../matcher.js";
import { CATCH_ALL_PATTERN, type HostnameRule } from "../rule.js";

export const exactHostnameMatcher: RuleMatcher<HostnameRule> = {
  compile(rules) {
    const rulesByHostname = new Map(
      rules
        .filter((rule) => rule.pattern !== CATCH_ALL_PATTERN)
        .map((rule) => [rule.pattern, rule]),
    );
    return {
      match(url) {
        const hostname = hostnameOf(url);
        const rule = rulesByHostname.get(hostname);
        return rule
          ? groupTarget(`rule:${rule.id}`, rule.groupTitle ?? hostname, rule)
          : null;
      },
    };
  },
};

export const catchAllMatcher: RuleMatcher<HostnameRule> = {
  compile(rules) {
    const catchAllRule = rules.find(
      (rule) => rule.pattern === CATCH_ALL_PATTERN,
    );
    return {
      match(url) {
        const hostname = hostnameOf(url);
        return catchAllRule && hostname !== ""
          ? groupTarget(`hostname:${hostname}`, hostname, catchAllRule)
          : null;
      },
    };
  },
};
