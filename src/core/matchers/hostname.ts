import {
  candidate,
  hostnameOf,
  type RankedRule,
  type RuleMatcher,
} from "../matcher.js";
import { CATCH_ALL_PATTERN, type HostnameRule } from "../rule.js";

export const exactHostnameMatcher: RuleMatcher<HostnameRule> = {
  compile(rankedRules) {
    const rulesByHostname = new Map<string, RankedRule<HostnameRule>>();
    for (const ranked of rankedRules) {
      if (
        ranked.rule.pattern !== CATCH_ALL_PATTERN &&
        !rulesByHostname.has(ranked.rule.pattern)
      ) {
        rulesByHostname.set(ranked.rule.pattern, ranked);
      }
    }
    return {
      match(url) {
        const hostname = hostnameOf(url);
        const ranked = rulesByHostname.get(hostname);
        return ranked
          ? candidate(
              ranked,
              `rule:${ranked.rule.id}`,
              ranked.rule.groupTitle ?? hostname,
            )
          : null;
      },
    };
  },
};

export const catchAllMatcher: RuleMatcher<HostnameRule> = {
  compile(rankedRules) {
    const catchAll = rankedRules.find(
      ({ rule }) => rule.pattern === CATCH_ALL_PATTERN,
    );
    return {
      match(url) {
        const hostname = hostnameOf(url);
        return catchAll && hostname !== ""
          ? candidate(catchAll, `hostname:${hostname}`, hostname)
          : null;
      },
    };
  },
};
