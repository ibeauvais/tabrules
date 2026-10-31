import {
  CATCH_ALL_PATTERN,
  type HostnameRule,
  type TabGroupColor,
} from "./rule.js";
import {
  isValidGroupTitle,
  isValidHostnamePattern,
  LIMITS,
} from "./validation.js";

export interface RuleDraft {
  patternInput: string;
  groupTitle: string;
  color: TabGroupColor | "";
}

export type DraftResult =
  { ok: true; rule: HostnameRule } | { ok: false; error: string };

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

export const normalizeHostnameInput = (input: string): string | null => {
  const trimmedInput = input.trim();
  if (trimmedInput === CATCH_ALL_PATTERN) {
    return CATCH_ALL_PATTERN;
  }
  const candidateUrl = trimmedInput.includes("://")
    ? trimmedInput
    : `http://${trimmedInput}`;
  if (trimmedInput === "" || !URL.canParse(candidateUrl)) {
    return null;
  }
  const url = new URL(candidateUrl);
  const hostname = url.hostname.replace(/\.$/, "");
  return SUPPORTED_PROTOCOLS.has(url.protocol) &&
    isValidHostnamePattern(hostname)
    ? hostname
    : null;
};

export const ruleFromDraft = (
  draft: RuleDraft,
  identity: Pick<HostnameRule, "id" | "enabled">,
  existingRules: readonly HostnameRule[],
): DraftResult => {
  const pattern = normalizeHostnameInput(draft.patternInput);
  if (pattern === null) {
    return {
      ok: false,
      error: `Enter a hostname such as github.com, or ${CATCH_ALL_PATTERN} for every site.`,
    };
  }
  const isDuplicate = existingRules.some(
    (rule) => rule.id !== identity.id && rule.pattern === pattern,
  );
  if (isDuplicate) {
    return { ok: false, error: `A rule for ${pattern} already exists.` };
  }
  const groupTitle = draft.groupTitle.trim();
  if (!isValidGroupTitle(groupTitle)) {
    return {
      ok: false,
      error: `Group titles are limited to ${String(LIMITS.maxGroupTitleLength)} characters, without line breaks.`,
    };
  }

  const rule: HostnameRule = { ...identity, type: "hostname", pattern };
  if (groupTitle !== "" && pattern !== CATCH_ALL_PATTERN) {
    rule.groupTitle = groupTitle;
  }
  if (draft.color !== "") {
    rule.color = draft.color;
  }
  return { ok: true, rule };
};
