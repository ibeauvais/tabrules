import type { Rule } from "../../core/rule.js";
import { errorMessage } from "../../engine/log.js";
import { requireElement, showMessage } from "../dom.js";
import {
  loadEnabled,
  loadRules,
  onSettingsChanged,
  saveEnabled,
} from "../settings-store.js";

const enabledToggle = requireElement("enabled", HTMLInputElement);
const summary = requireElement("summary", HTMLParagraphElement);
const popupError = requireElement("popup-error", HTMLParagraphElement);
const optionsButton = requireElement("open-options", HTMLButtonElement);

const describeRules = (rules: readonly Rule[]): string => {
  if (rules.length === 0) {
    return "No rules yet.";
  }
  const activeCount = rules.filter((rule) => rule.enabled).length;
  return `${String(activeCount)} of ${String(rules.length)} rules active.`;
};

const refresh = async (): Promise<void> => {
  const [stored, enabled] = await Promise.all([loadRules(), loadEnabled()]);
  enabledToggle.checked = enabled;
  summary.textContent = stored.isCorrupted
    ? "Saved rules are invalid. Open the settings to fix them."
    : describeRules(stored.rules);
};

const reportError = (error: unknown): void => {
  showMessage(popupError, errorMessage(error));
};

enabledToggle.addEventListener("change", () => {
  saveEnabled(enabledToggle.checked).catch((error: unknown) => {
    enabledToggle.checked = !enabledToggle.checked;
    reportError(error);
  });
});

optionsButton.addEventListener("click", () => {
  chrome.runtime
    .openOptionsPage()
    .then(() => {
      window.close();
    })
    .catch(reportError);
});

onSettingsChanged(() => {
  refresh().catch(reportError);
});

await refresh().catch(reportError);
