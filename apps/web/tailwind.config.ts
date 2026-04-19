import type { Config } from "tailwindcss";
import { tailwindThemeExtension } from "../../packages/ui/src/theme";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: tailwindThemeExtension,
  },
  plugins: [],
};

export default config;
