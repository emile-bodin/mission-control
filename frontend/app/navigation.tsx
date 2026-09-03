"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href?: string; label: string; icon: string; exact?: boolean };

const items: Item[] = [
  { href: "/", label: "Dashboard", icon: "⌂", exact: true },
  { href: "/agenda", label: "Agenda", icon: "□" },
  { label: "Health", icon: "♡" },
  { href: "/projects", label: "Projecten", icon: "⌘" },
  { href: "/actions", label: "Taken", icon: "☑" },
  { label: "Notities", icon: "▤" },
  { label: "Routines", icon: "◉" },
  { href: "/homelab", label: "Pulse", icon: "⌁" },
  { label: "Instellingen", icon: "⚙" }
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="mt-8 grid grid-cols-2 gap-1 sm:grid-cols-3 md:block md:space-y-1" aria-label="Hoofdnavigatie">
      {items.map((item) => {
        const active = item.href && (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
        const className = `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-[linear-gradient(105deg,rgba(51,84,203,0.34),rgba(37,61,157,0.25))] text-blue-50 shadow-[inset_0_1px_0_rgba(141,174,255,0.16)]" : "text-slate-400 hover:bg-slate-800/60 hover:text-white"}`;
        const content = <><span className="w-4 text-center text-base leading-none" aria-hidden="true">{item.icon}</span><span>{item.label}</span>{!item.href && <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-600">Unknown</span>}</>;

        return item.href ? <Link className={className} href={item.href} key={item.label}>{content}</Link> : <span className={`${className} cursor-not-allowed opacity-70`} aria-disabled="true" key={item.label}>{content}</span>;
      })}
    </nav>
  );
}
