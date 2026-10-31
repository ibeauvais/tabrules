export type TabGroupColor = `${chrome.tabGroups.Color}`;

const TAB_GROUP_COLORS: Record<TabGroupColor, true> = {
  blue: true,
  cyan: true,
  green: true,
  grey: true,
  orange: true,
  pink: true,
  purple: true,
  red: true,
  yellow: true,
};

export const TAB_GROUP_COLOR_NAMES = Object.keys(
  TAB_GROUP_COLORS,
) as readonly TabGroupColor[];

export const isTabGroupColor = (value: unknown): value is TabGroupColor =>
  typeof value === "string" && Object.hasOwn(TAB_GROUP_COLORS, value);

export const CATCH_ALL_PATTERN = "*";

export interface HostnameRule {
  id: string;
  type: "hostname";
  pattern: string;
  groupTitle?: string;
  color?: TabGroupColor;
  enabled: boolean;
}

export type Rule = HostnameRule;
