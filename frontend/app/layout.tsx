import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bodin Control Center",
  description: "Personal project and homelab cockpit"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
