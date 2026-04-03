import type React from "react";

export const colors = {
  bg: "#f7f7f8",
  surface: "#ffffff",
  surfaceMuted: "#fafafa",
  border: "#e5e7eb",
  borderStrong: "#d1d5db",
  text: "#111827",
  textMuted: "#6b7280",
  primary: "#111827",
  primaryText: "#ffffff",
  dangerBg: "#fff5f5",
  dangerBorder: "#fecaca",
  dangerText: "#b91c1c",
  successBg: "#ecfdf5",
  successText: "#166534",
  errorBg: "#fef2f2",
  errorText: "#991b1b",
  urgentBg: "#fee2e2",
  urgentText: "#991b1b",
  moneyBg: "#dcfce7",
  moneyText: "#166534",
  quickWinBg: "#fef3c7",
  quickWinText: "#92400e",
  neutralBadgeBg: "#e5e7eb",
  neutralBadgeText: "#374151"
};

export const radius = {
  sm: 10,
  md: 12,
  lg: 14,
  xl: 18,
  pill: 999
};

export const shadow = {
  card: "0 1px 3px rgba(0,0,0,0.08)",
  cardSoft: "0 1px 2px rgba(0,0,0,0.05)",
  modal: "0 20px 60px rgba(0,0,0,0.25)"
};

export const spacing = {
  pageWidth: 980,
  pagePadding: 24,
  sectionGap: 24,
  cardPadding: 20
};

export const text = {
  pageTitle: {
    margin: "0 0 8px 0",
    fontSize: 32,
    fontWeight: 700
  } satisfies React.CSSProperties,
  sectionTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700
  } satisfies React.CSSProperties,
  bodyMuted: {
    color: colors.textMuted,
    margin: 0
  } satisfies React.CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 8
  } satisfies React.CSSProperties
};

export const pageStyles = {
  shell: {
    maxWidth: spacing.pageWidth,
    margin: "40px auto",
    padding: spacing.pagePadding
  } satisfies React.CSSProperties,
  header: {
    marginBottom: 24
  } satisfies React.CSSProperties
};

export const cardStyles = {
  section: {
    background: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.cardPadding,
    boxShadow: shadow.card
  } satisfies React.CSSProperties,
  item: {
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    padding: 16,
    background: colors.surfaceMuted,
    boxShadow: shadow.cardSoft
  } satisfies React.CSSProperties,
  bordered: {
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    padding: 14,
    background: colors.surfaceMuted
  } satisfies React.CSSProperties
};

export const buttonStyles = {
  primary: {
    border: "none",
    background: colors.primary,
    color: colors.primaryText,
    borderRadius: radius.sm,
    padding: "10px 14px",
    fontWeight: 600,
    cursor: "pointer"
  } satisfies React.CSSProperties,
  secondary: {
    border: `1px solid ${colors.borderStrong}`,
    background: colors.surface,
    color: colors.text,
    borderRadius: radius.sm,
    padding: "10px 14px",
    fontWeight: 600,
    cursor: "pointer"
  } satisfies React.CSSProperties,
  danger: {
    border: `1px solid ${colors.dangerBorder}`,
    background: colors.dangerBg,
    color: colors.dangerText,
    borderRadius: radius.sm,
    padding: "10px 14px",
    fontWeight: 600,
    cursor: "pointer"
  } satisfies React.CSSProperties,
  link: {
    border: `1px solid ${colors.borderStrong}`,
    background: colors.surface,
    color: colors.text,
    borderRadius: radius.sm,
    padding: "10px 14px",
    fontWeight: 600,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center"
  } satisfies React.CSSProperties
};

export const inputStyles = {
  input: {
    padding: "12px 14px",
    borderRadius: radius.md,
    border: `1px solid ${colors.borderStrong}`,
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box"
  } satisfies React.CSSProperties,
  textarea: {
    padding: "12px 14px",
    borderRadius: radius.md,
    border: `1px solid ${colors.borderStrong}`,
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
    resize: "vertical"
  } satisfies React.CSSProperties
};

export const feedbackStyles = {
  error: {
    marginTop: 14,
    padding: 10,
    borderRadius: radius.sm,
    background: colors.errorBg,
    color: colors.errorText
  } satisfies React.CSSProperties,
  success: {
    marginTop: 14,
    padding: 10,
    borderRadius: radius.sm,
    background: colors.successBg,
    color: colors.successText
  } satisfies React.CSSProperties
};

export function getHookBadgeStyle(label: "urgent" | "money" | "quick_win" | "none") {
  const base: React.CSSProperties = {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: radius.pill,
    fontSize: 12,
    fontWeight: 600
  };

  if (label === "urgent") {
    return { ...base, background: colors.urgentBg, color: colors.urgentText };
  }

  if (label === "money") {
    return { ...base, background: colors.moneyBg, color: colors.moneyText };
  }

  if (label === "quick_win") {
    return { ...base, background: colors.quickWinBg, color: colors.quickWinText };
  }

  return { ...base, background: colors.neutralBadgeBg, color: colors.neutralBadgeText };
}

export function formatDateTime(value?: string | null) {
  if (!value) return "No due date";
  return new Date(value).toLocaleString();
}
