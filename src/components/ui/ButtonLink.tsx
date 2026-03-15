import type { PropsWithChildren } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { cn } from "./cn";

type ButtonLinkVariant = "primary" | "secondary" | "ghost";
type ButtonLinkSize = "sm" | "md";

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonLinkVariant;
  size?: ButtonLinkSize;
  className?: string;
}

export function ButtonLink({
  children,
  className,
  variant = "secondary",
  size = "md",
  ...props
}: PropsWithChildren<ButtonLinkProps>) {
  return (
    <Link
      className={cn(
        "ui-button",
        `ui-button-${variant}`,
        `ui-button-${size}`,
        "ui-button-link",
        className
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
