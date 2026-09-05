"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href?: string; label: string; icon: string; exact?: boolean };

const items: Item[] = [
  { href: "/", label: "Dagbrief", icon: "wb_sunny", exact: true },
  { href: "/ideas", label: "Ideeën", icon: "lightbulb" },
  { href: "/projects", label: "Projecten", icon: "layers" },
  { href: "/homelab", label: "Homelab", icon: "dns" },
  { href: "/actions", label: "Taken", icon: "check_box" },
  { href: "/agenda", label: "Agenda", icon: "calendar_today" },
  { href: "/health", label: "Health", icon: "monitor_heart" },
  { href: "/routines", label: "Routines", icon: "tune" },
  { href: "/unavailable/settings", label: "Instellingen", icon: "settings" }
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="mt-4 grid grid-cols-2 gap-1 sm:grid-cols-3 md:block md:space-y-1" aria-label="Hoofdnavigatie">
      {items.map((item) => {
        const active = item.href && (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
        const className = `cortex-focus flex items-center gap-space-sm rounded px-space-sm py-space-xs text-body-sm transition-colors ${active ? "bg-surface-container-high text-primary shadow-[inset_2px_0_0_0_#4cd7f6]" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"}`;
        const content = <><span className="material-symbols-outlined text-[18px]" aria-hidden="true">{item.icon}</span><span className="md:hidden lg:inline">{item.label}</span>{!item.href && <span className="ml-auto text-[10px] uppercase tracking-wide text-outline">Unknown</span>}</>;

        return item.href ? <Link className={className} href={item.href} key={item.label}>{content}</Link> : <span className={`${className} cursor-not-allowed opacity-70`} aria-disabled="true" key={item.label}>{content}</span>;
      })}
    </nav>
  );
}
