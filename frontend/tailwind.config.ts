import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0c1322",
        surface: "#0c1322",
        "surface-container-lowest": "#070e1d",
        "surface-container-low": "#141b2b",
        "surface-container": "#191f2f",
        "surface-container-high": "#232a3a",
        "surface-container-highest": "#2e3545",
        "surface-bright": "#323949",
        "on-surface": "#dce2f7",
        "on-surface-variant": "#bcc9cd",
        outline: "#869397",
        "outline-variant": "#3d494c",
        primary: "#4cd7f6",
        "primary-container": "#06b6d4",
        "primary-fixed-dim": "#4cd7f6",
        "on-primary": "#003640",
        secondary: "#c0c1ff",
        "secondary-container": "#3131c0",
        "secondary-fixed": "#e1e0ff",
        "secondary-fixed-dim": "#c0c1ff",
        tertiary: "#4edea3",
        "tertiary-container": "#1bbd85",
        error: "#ffb4ab"
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem"
      },
      spacing: {
        "space-2xs": "0.125rem",
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "space-md": "0.75rem",
        "space-base": "1rem",
        "space-lg": "1.25rem",
        "space-xl": "1.5rem",
        "space-2xl": "2rem",
        "space-3xl": "3rem",
        gutter: "0.75rem",
        "margin-mobile": "1rem",
        "margin-desktop": "1.5rem",
        "sidebar-width": "16rem",
        "command-bar-max-width": "42rem"
      },
      fontFamily: {
        headline: ["Plus Jakarta Sans", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      },
      fontSize: {
        "headline-xl": ["32px", { lineHeight: "40px", letterSpacing: "-0.03em", fontWeight: "700" }],
        "headline-md": ["18px", { lineHeight: "24px", letterSpacing: "-0.015em", fontWeight: "600" }],
        "headline-sm": ["15px", { lineHeight: "20px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "body-sm": ["12px", { lineHeight: "16px" }],
        "mono-data-sm": ["11px", { lineHeight: "14px", letterSpacing: "0.02em" }],
        "mono-metric-lg": ["24px", { lineHeight: "28px", letterSpacing: "-0.04em", fontWeight: "600" }],
        "label-caps": ["10px", { lineHeight: "12px", letterSpacing: "0.08em", fontWeight: "600" }]
      }
    }
  },
  plugins: []
};

export default config;
