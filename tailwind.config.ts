import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        hl: {
          green: {
            50: "#f1f5f0",
            100: "#dfe8dd",
            200: "#bfd0bc",
            300: "#9bb597",
            400: "#7a9a76",
            500: "#5e8159",
            600: "#4d6a4b",
            700: "#3d5a3b",
            800: "#314830",
            900: "#293a28",
          },
          cream: "#f8f6f1",
          paper: "#fdfcf8",
          ink: "#1f2421",
          muted: "#6b7066",
          border: "#e4e2db",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,30,20,0.04), 0 1px 1px rgba(20,30,20,0.03)",
      },
    },
  },
  plugins: [],
};

export default config;
