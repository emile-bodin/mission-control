"use client";

import { useEffect, useState } from "react";

const timezone = "Europe/Amsterdam";

function formatDate(now: Date) {
  return new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: timezone }).format(now);
}

function formatTime(now: Date) {
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(now);
}

export function LocalClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!now) return <p className="text-sm text-slate-500">Lokale tijd wordt geladen</p>;

  return <div className="text-right"><p className="capitalize text-sm text-slate-300">{formatDate(now)}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-white">◷ {formatTime(now)}</p></div>;
}
