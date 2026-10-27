import type { GroupTarget, RuleMatcher } from "../matcher.js";
import { CATCH_ALL_PATTERN, type HostnameRule } from "../rule.js";

const toTarget = (
  key: string,
  title: string,
  rule: HostnameRule,
): GroupTarget =>
  rule.color === undefined ? { key, title } : { key, title, color: rule.color };

export const hostnameMatcher: RuleMatcher<HostnameRule> = {
  type: "hostname",
  compile(rules) {
    const exactRules = new Map<string, HostnameRule>();
    let catchAllRule: HostnameRule | undefined;
    for (const rule of rules) {
      if (rule.pattern === CATCH_ALL_PATTERN) {
        catchAllRule = rule;
      } else {
        exactRules.set(rule.pattern, rule);
      }
    }

    return {
      match(url) {
        const hostname = url.hostname.replace(/\.$/, "");
        if (hostname === "") {
          return null;
        }
        const exactRule = exactRules.get(hostname);
        if (exactRule) {
          return toTarget(
            `rule:${exactRule.id}`,
            exactRule.groupTitle ?? hostname,
            exactRule,
          );
        }
        if (catchAllRule) {
          return toTarget(`hostname:${hostname}`, hostname, catchAllRule);
        }
        return null;
      },
    };
  },
};
