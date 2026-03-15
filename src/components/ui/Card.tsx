import type { HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "./cn";

type CardTone = "default" | "muted" | "hero";

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "article" | "section" | "div" | "header";
  tone?: CardTone;
}

export function Card({
  as = "section",
  children,
  className,
  tone = "default",
  ...props
}: PropsWithChildren<CardProps>) {
  const Component = as;

  return (
    <Component className={cn("ui-card", `ui-card-${tone}`, className)} {...props}>
      {children}
    </Component>
  );
}
