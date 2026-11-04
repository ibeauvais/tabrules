import {
  CATCH_ALL_PATTERN,
  type Rule,
  type RuleType,
  type TabGroupColor,
} from "./rule.js";
import {
  isValidGroupTitle,
  isValidHostnamePattern,
  LIMITS,
  regexPatternError,
} from "./validation.js";

export interface RuleDraft {
  matchType: RuleType;
  patternInput: string;
  groupTitle: string;
  color: TabGroupColor | "";
}

export type DraftResult =
  { ok: true; rule: Rule } | { ok: false; error: string };

type PatternResult =
  { ok: true; pattern: string } | { ok: false; error: string };

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

const patternFromDraft = (draft: RuleDraft): PatternResult => {
  if (draft.matchType === "regex") {
    const pattern = draft.patternInput.trim();
    const error = regexPatternError(pattern);
    return error === null
      ? { ok: true, pattern }
      : { ok: false, error: `Invalid regular expression: ${error}.` };
  }
  const pattern = normalizeHostnameInput(draft.patternInput);
  return pattern === null
    ? {
        ok: false,
        error: `Enter a hostname such as github.com, or ${CATCH_ALL_PATTERN} for every site.`,
      }
    : { ok: true, pattern };
};

export const ruleFromDraft = (
  draft: RuleDraft,
  identity: Pick<Rule, "id" | "enabled">,
  existingRules: readonly Rule[],
): DraftResult => {
  const patternResult = patternFromDraft(draft);
  if (!patternResult.ok) {
    return patternResult;
  }
  const { pattern } = patternResult;
  const isDuplicate = existingRules.some(
    (rule) =>
      rule.id !== identity.id &&
      rule.type === draft.matchType &&
      rule.pattern === pattern,
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

  const rule: Rule = { ...identity, type: draft.matchType, pattern };
  const isCatchAll =
    draft.matchType === "hostname" && pattern === CATCH_ALL_PATTERN;
  if (groupTitle !== "" && !isCatchAll) {
    rule.groupTitle = groupTitle;
  }
  if (draft.color !== "") {
    rule.color = draft.color;
  }
  return { ok: true, rule };
};
