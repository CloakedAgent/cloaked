"use client";

import { memo, ReactNode } from "react";
import { Info, AlertTriangle, Lightbulb, AlertCircle } from "lucide-react";

type CalloutType = "info" | "warning" | "tip" | "danger";

interface CalloutProps {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
}

const CALLOUT_CONFIG = {
  info: {
    icon: Info,
    className: "docs-callout-info",
    defaultTitle: "Note",
  },
  warning: {
    icon: AlertTriangle,
    className: "docs-callout-warning",
    defaultTitle: "Warning",
  },
  tip: {
    icon: Lightbulb,
    className: "docs-callout-tip",
    defaultTitle: "Tip",
  },
  danger: {
    icon: AlertCircle,
    className: "docs-callout-danger",
    defaultTitle: "Danger",
  },
} as const;

export const Callout = memo(function Callout({
  type = "info",
  title,
  children,
}: CalloutProps) {
  const config = CALLOUT_CONFIG[type];
  const Icon = config.icon;
  const displayTitle = title || config.defaultTitle;

  return (
    <div className={`docs-callout ${config.className}`}>
      <div className="docs-callout-header">
        <Icon className="w-5 h-5" />
        <span className="docs-callout-title">{displayTitle}</span>
      </div>
      <div className="docs-callout-content">{children}</div>
    </div>
  );
});
