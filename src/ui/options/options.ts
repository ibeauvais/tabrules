import { ruleFromDraft } from "../../core/rule-editing.js";
import {
  CATCH_ALL_PATTERN,
  isTabGroupColor,
  TAB_GROUP_COLOR_NAMES,
  type Rule,
  type RuleType,
} from "../../core/rule.js";
import {
  MAX_RULES_FILE_BYTES,
  parseRulesFile,
  serializeRulesFile,
} from "../../core/rules-file.js";
import { errorMessage } from "../../engine/log.js";
import { createElement, requireElement, showMessage } from "../dom.js";
import { loadRules, onSettingsChanged, saveRules } from "../settings-store.js";

const form = requireElement("rule-form", HTMLFormElement);
const formTitle = requireElement("form-title", HTMLHeadingElement);
const matchTypeSelect = requireElement("match-type", HTMLSelectElement);
const patternLabel = requireElement("pattern-label", HTMLSpanElement);
const regexHelp = requireElement("regex-help", HTMLParagraphElement);
const patternInput = requireElement("pattern", HTMLInputElement);
const groupTitleInput = requireElement("group-title", HTMLInputElement);
const colorSelect = requireElement("color", HTMLSelectElement);
const submitButton = requireElement("submit", HTMLButtonElement);
const cancelButton = requireElement("cancel-edit", HTMLButtonElement);
const formError = requireElement("form-error", HTMLParagraphElement);
const storageError = requireElement("storage-error", HTMLParagraphElement);
const listError = requireElement("list-error", HTMLParagraphElement);
const rulesTable = requireElement("rules-table", HTMLTableElement);
const rulesBody = requireElement("rules-body", HTMLTableSectionElement);
const emptyState = requireElement("empty-state", HTMLDivElement);
const addCatchAllButton = requireElement("add-catch-all", HTMLButtonElement);
const exportButton = requireElement("export", HTMLButtonElement);
const importInput = requireElement("import", HTMLInputElement);

const EXPORT_FILE_NAME = "tabrules-rules.json";
const MAX_REPORTED_IMPORT_ERRORS = 3;

let rules: Rule[] = [];
let editingRuleId: string | null = null;

const isCatchAll = (rule: Rule) =>
  rule.type === "hostname" && rule.pattern === CATCH_ALL_PATTERN;

const selectedMatchType = (): RuleType =>
  matchTypeSelect.value === "regex" ? "regex" : "hostname";

const persist = async (nextRules: Rule[]): Promise<void> => {
  await saveRules(nextRules);
  rules = nextRules;
  render();
};

const runListAction = (action: () => Promise<void>): void => {
  showMessage(listError, "");
  action().catch((error: unknown) => {
    showMessage(listError, `Could not save: ${errorMessage(error)}`);
  });
};

const updateFormForMatchType = (): void => {
  const isRegex = selectedMatchType() === "regex";
  patternLabel.textContent = isRegex ? "Regular expression" : "Hostname";
  patternInput.placeholder = isRegex
    ? "(^|\\.)google\\.com$"
    : `github.com, or ${CATCH_ALL_PATTERN} for every site`;
  groupTitleInput.placeholder = isRegex
    ? "Defaults to the pattern"
    : "Defaults to the hostname";
  regexHelp.hidden = !isRegex;

  const isCatchAllInput =
    !isRegex && patternInput.value.trim() === CATCH_ALL_PATTERN;
  groupTitleInput.disabled = isCatchAllInput;
  if (isCatchAllInput) {
    groupTitleInput.value = "";
  }
};

const resetForm = (): void => {
  editingRuleId = null;
  form.reset();
  formTitle.textContent = "Add a rule";
  submitButton.textContent = "Add rule";
  cancelButton.hidden = true;
  showMessage(formError, "");
  updateFormForMatchType();
};

const startEditing = (rule: Rule): void => {
  editingRuleId = rule.id;
  matchTypeSelect.value = rule.type;
  patternInput.value = rule.pattern;
  groupTitleInput.value = rule.groupTitle ?? "";
  colorSelect.value = rule.color ?? "";
  formTitle.textContent = "Edit rule";
  submitButton.textContent = "Save rule";
  cancelButton.hidden = false;
  showMessage(formError, "");
  updateFormForMatchType();
  patternInput.focus();
};

const renderRow = (rule: Rule): HTMLTableRowElement => {
  const label = isCatchAll(rule) ? "every site" : rule.pattern;

  const enabledToggle = createElement("input", {
    attributes: { type: "checkbox", "aria-label": `Enable rule for ${label}` },
  });
  enabledToggle.checked = rule.enabled;
  enabledToggle.addEventListener("change", () => {
    runListAction(() =>
      persist(
        rules.map((existing) =>
          existing.id === rule.id
            ? { ...existing, enabled: enabledToggle.checked }
            : existing,
        ),
      ),
    );
  });

  const patternCell = createElement("td", {}, [
    createElement("code", { text: rule.pattern }),
  ]);
  if (isCatchAll(rule)) {
    patternCell.append(
      createElement("span", { className: "muted", text: " every site" }),
    );
  }

  const titleCell =
    rule.groupTitle === undefined
      ? createElement("td", {
          className: "muted",
          text: isCatchAll(rule) ? "Its hostname" : rule.pattern,
        })
      : createElement("td", { text: rule.groupTitle });

  const colorCell = createElement("td", {}, [
    createElement("span", {
      className: `swatch swatch-${rule.color ?? "auto"}`,
      attributes: { "aria-hidden": "true" },
    }),
    rule.color ?? "Automatic",
  ]);

  const editButton = createElement("button", {
    className: "link",
    text: "Edit",
    attributes: { type: "button", "aria-label": `Edit rule for ${label}` },
  });
  editButton.addEventListener("click", () => {
    startEditing(rule);
  });

  const deleteButton = createElement("button", {
    className: "link danger",
    text: "Delete",
    attributes: { type: "button", "aria-label": `Delete rule for ${label}` },
  });
  deleteButton.addEventListener("click", () => {
    if (editingRuleId === rule.id) {
      resetForm();
    }
    runListAction(() =>
      persist(rules.filter((existing) => existing.id !== rule.id)),
    );
  });

  return createElement("tr", {}, [
    createElement("td", {}, [enabledToggle]),
    createElement("td", { text: rule.type === "regex" ? "Regex" : "Exact" }),
    patternCell,
    titleCell,
    colorCell,
    createElement("td", { className: "row-actions" }, [
      editButton,
      deleteButton,
    ]),
  ]);
};

function render(): void {
  rulesBody.replaceChildren(...rules.map(renderRow));
  rulesTable.hidden = rules.length === 0;
  emptyState.hidden = rules.length > 0;
  exportButton.disabled = rules.length === 0;
}

const refresh = async (): Promise<void> => {
  const stored = await loadRules();
  rules = stored.rules;
  showMessage(
    storageError,
    stored.isCorrupted
      ? "Your saved rules are invalid and are being ignored. Add or import rules to replace them."
      : "",
  );
  render();
};

const exportRules = (): void => {
  const blob = new Blob([serializeRulesFile(rules)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = createElement("a", {
    attributes: { href: url, download: EXPORT_FILE_NAME },
  });
  link.click();
  URL.revokeObjectURL(url);
};

const importRules = async (file: File): Promise<void> => {
  if (file.size > MAX_RULES_FILE_BYTES) {
    showMessage(listError, "Import failed: the file is too large.");
    return;
  }
  const result = parseRulesFile(await file.text());
  if (!result.ok) {
    const remaining = result.errors.length - MAX_REPORTED_IMPORT_ERRORS;
    const details = result.errors
      .slice(0, MAX_REPORTED_IMPORT_ERRORS)
      .join(" ");
    showMessage(
      listError,
      `Import failed: ${details}${remaining > 0 ? ` (and ${String(remaining)} more)` : ""}`,
    );
    return;
  }
  const confirmed =
    rules.length === 0 ||
    window.confirm(
      `Replace your ${String(rules.length)} rules with the ${String(result.rules.length)} imported rules?`,
    );
  if (confirmed) {
    resetForm();
    await persist(result.rules);
  }
};

for (const color of TAB_GROUP_COLOR_NAMES) {
  colorSelect.append(
    createElement("option", { text: color, attributes: { value: color } }),
  );
}

matchTypeSelect.addEventListener("change", updateFormForMatchType);
patternInput.addEventListener("input", updateFormForMatchType);
updateFormForMatchType();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const editedRule = rules.find((rule) => rule.id === editingRuleId);
  const result = ruleFromDraft(
    {
      matchType: selectedMatchType(),
      patternInput: patternInput.value,
      groupTitle: groupTitleInput.value,
      color: isTabGroupColor(colorSelect.value) ? colorSelect.value : "",
    },
    {
      id: editedRule?.id ?? crypto.randomUUID(),
      enabled: editedRule?.enabled ?? true,
    },
    rules,
  );
  if (!result.ok) {
    showMessage(formError, result.error);
    patternInput.focus();
    return;
  }
  const nextRules = editedRule
    ? rules.map((rule) => (rule.id === editedRule.id ? result.rule : rule))
    : [...rules, result.rule];
  persist(nextRules)
    .then(resetForm)
    .catch((error: unknown) => {
      showMessage(formError, `Could not save: ${errorMessage(error)}`);
    });
});

cancelButton.addEventListener("click", resetForm);

addCatchAllButton.addEventListener("click", () => {
  runListAction(() =>
    persist([
      ...rules,
      {
        id: crypto.randomUUID(),
        type: "hostname",
        pattern: CATCH_ALL_PATTERN,
        enabled: true,
      },
    ]),
  );
});

exportButton.addEventListener("click", exportRules);

importInput.addEventListener("change", () => {
  const file = importInput.files?.[0];
  importInput.value = "";
  if (file) {
    runListAction(() => importRules(file));
  }
});

onSettingsChanged(() => {
  refresh().catch((error: unknown) => {
    showMessage(storageError, `Could not load rules: ${errorMessage(error)}`);
  });
});

try {
  await refresh();
} catch (error) {
  showMessage(storageError, `Could not load rules: ${errorMessage(error)}`);
}
