import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./store/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Inter var'", "system-ui", "sans-serif"]
      },
      colors: {
        hubba: {
          black: "#0a0a0a",
          orange: "#ff6b35",
          green: "#3bb273"
        }
      },
      boxShadow: {
        glow: "0 0 20px rgba(59, 178, 115, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
