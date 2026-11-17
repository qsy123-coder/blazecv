import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Noto Sans SC",
          "PingFang SC",
          "Microsoft YaHei",
          "Hiragino Sans GB",
          "system-ui",
          "sans-serif",
        ],
        serif: ["Noto Serif SC", "Songti SC", "SimSun", "Georgia", "serif"],
      },
      colors: {
        ink: "#111827",
        paper: "#f4f5f7",
        line: "#e5e7eb",
        brand: "#2563eb",
      },
    },
  },
  plugins: [],
};

export default config;
