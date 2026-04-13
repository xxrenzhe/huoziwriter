import type { Config } from "tailwindcss";
import { tailwindThemeExtension } from "@huoziwriter/ui";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: tailwindThemeExtension,
  },
  plugins: [],
};

export default config;
