"use client";

import { useEffect, useState } from "react";

function format(now: Date) {
  return new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(now);
}

export function LocalClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return <p className="text-sm text-slate-400">{now ? format(now) : "Lokale tijd wordt geladen"}</p>;
}
