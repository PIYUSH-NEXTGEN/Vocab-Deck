import type { HTMLAttributes, ReactNode } from "react";

export function Panel({
  children,
  className,
  as: Tag = "section",
  ...rest
}: HTMLAttributes<HTMLElement> & { children: ReactNode; as?: "section" | "div" | "article" | "li" }) {
  return (
    <Tag className={["panel", className ?? ""].filter(Boolean).join(" ")} {...rest}>
      {children}
    </Tag>
  );
}
