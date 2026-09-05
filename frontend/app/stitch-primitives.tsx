import type { ReactNode } from "react";

export interface StitchPanelProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function StitchPanel({ children, className = "" }: StitchPanelProps) {
  return <section className={`cortex-stitch-panel ${className}`}>{children}</section>;
}

export interface StitchSectionTitleProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly detail?: string;
}

export function StitchSectionTitle({ eyebrow, title, detail }: StitchSectionTitleProps) {
  return <header className="flex items-center justify-between gap-3 border-b border-surface-container-highest pb-2"><div><p className="font-label-caps text-label-caps text-outline">{eyebrow}</p><h2 className="mt-1 font-headline text-headline-md text-on-surface">{title}</h2></div>{detail && <span className="font-mono text-mono-data-sm text-outline">{detail}</span>}</header>;
}

export interface StitchUnavailableProps {
  readonly title: string;
  readonly detail: string;
  readonly className?: string;
}

export function StitchUnavailable({ title, detail, className = "" }: StitchUnavailableProps) {
  return <StitchPanel className={`p-3 ${className}`}><p className="font-label-caps text-label-caps text-outline">UNAVAILABLE BY SOURCE</p><h3 className="mt-1 font-headline text-headline-sm text-on-surface">{title}</h3><p className="mt-2 text-body-sm text-on-surface-variant">{detail}</p></StitchPanel>;
}

export interface StitchMetricProps {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone?: "primary" | "tertiary" | "outline";
}

export function StitchMetric({ label, value, detail, tone = "outline" }: StitchMetricProps) {
  const color = tone === "primary" ? "text-primary" : tone === "tertiary" ? "text-tertiary" : "text-on-surface";
  return <StitchPanel className="min-h-32 p-3"><p className="font-label-caps text-label-caps text-outline">{label}</p><p className={`mt-4 font-mono text-mono-metric-lg ${color}`}>{value}</p><p className="mt-2 text-body-sm text-on-surface-variant">{detail}</p></StitchPanel>;
}
