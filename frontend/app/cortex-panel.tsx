import type { ReactNode } from "react";

type CortexPanelProps = Readonly<{
  children: ReactNode;
  className?: string;
}>;

export function CortexPanel({ children, className = "" }: CortexPanelProps) {
  return <section className={`cortex-panel rounded-md border border-surface-container-highest ${className}`}>{children}</section>;
}
