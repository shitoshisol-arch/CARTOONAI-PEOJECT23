/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#050609",
        abyss: "#07090d",
        panel: "#0a0d12",
        raised: "#0e1219",
        line: "#1b212b",
        "line-bright": "#2b3440",
        ink: "#e8eef4",
        muted: "#7f8b9a",
        dim: "#4d5764",
        acid: "#c8ff3d",
        "acid-dim": "#8fbf28",
        amber: "#ffb84d",
        ember: "#ff7a3d",
        ice: "#7ce7ff",
        danger: "#ff5d5d",
        ok: "#6dffa8",
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
        body: ['"Inter"', "system-ui", "sans-serif"],
      },
      letterSpacing: {
        hud: "0.22em",
        wide2: "0.14em",
      },
      animation: {
        "fade-up": "fadeUp 700ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fadeIn 900ms ease both",
        "pulse-dot": "pulseDot 2.2s ease-in-out infinite",
        scan: "scan 9s linear infinite",
        ticker: "ticker 38s linear infinite",
        glitch: "glitch 5s steps(1) infinite",
        "spin-slow": "spin 14s linear infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 rgba(200,255,61,0.4)" },
          "50%": { opacity: "0.55", boxShadow: "0 0 0 6px rgba(200,255,61,0)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        glitch: {
          "0%, 92%, 100%": { textShadow: "0 0 0 transparent", transform: "translateX(0)" },
          "93%": { textShadow: "2px 0 #7ce7ff, -2px 0 #ff7a3d", transform: "translateX(-1px)" },
          "94%": { textShadow: "-2px 0 #7ce7ff, 2px 0 #ff7a3d", transform: "translateX(1px)" },
          "95%": { textShadow: "0 0 0 transparent", transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};
