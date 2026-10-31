import type { Rule } from "./rule.js";
import { isPlainObject, parseRules, type ParseResult } from "./validation.js";

const FILE_FORMAT = "tabrules";
const FILE_VERSION = 1;

export const MAX_RULES_FILE_BYTES = 1_000_000;

export const serializeRulesFile = (rules: readonly Rule[]): string =>
  `${JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, rules }, null, 2)}\n`;

export const parseRulesFile = (text: string): ParseResult => {
  if (text.length > MAX_RULES_FILE_BYTES) {
    return { ok: false, errors: ["The file is too large."] };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The file is not valid JSON."] };
  }
  if (
    !isPlainObject(data) ||
    data.format !== FILE_FORMAT ||
    data.version !== FILE_VERSION
  ) {
    return {
      ok: false,
      errors: ["The file is not a TabRules export (format version 1)."],
    };
  }
  return parseRules(data.rules);
};
