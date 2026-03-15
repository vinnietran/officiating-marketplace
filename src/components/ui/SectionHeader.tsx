import type { ReactNode } from "react";
import { cn } from "./cn";

interface SectionHeaderProps {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  meta,
  actions,
  className
}: SectionHeaderProps) {
  return (
    <div className={cn("ui-section-header", className)}>
      <div className="ui-section-header-copy">
        <h2>{title}</h2>
        {meta ? <span>{meta}</span> : null}
      </div>
      {actions ? <div className="ui-section-header-actions">{actions}</div> : null}
    </div>
  );
}
