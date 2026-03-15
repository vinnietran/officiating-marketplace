import type { ReactNode } from "react";
import { cn } from "./cn";

export interface PageHeaderStat {
  label: string;
  value: ReactNode;
}

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  badges?: ReactNode;
  stats?: PageHeaderStat[];
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  badges,
  stats = [],
  className
}: PageHeaderProps) {
  return (
    <header className={cn("hero page-header", className)}>
      <div className="page-header-content">
        <div>
          {eyebrow ? <span className="hero-eyebrow">{eyebrow}</span> : null}
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {actions || badges ? (
          <div className={actions ? "hero-actions" : "hero-badges"}>
            {actions ?? badges}
          </div>
        ) : null}
      </div>

      {stats.length > 0 ? (
        <div className="hero-stats">
          {stats.map((stat) => (
            <article key={stat.label} className="hero-stat-card">
              <span className="hero-stat-label">{stat.label}</span>
              <strong className="hero-stat-value">{stat.value}</strong>
            </article>
          ))}
        </div>
      ) : null}
    </header>
  );
}
