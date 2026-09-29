/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      keyframes: {
        "fade-up": { "0%": { opacity: 0, transform: "translateY(6px)" }, "100%": { opacity: 1, transform: "none" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        glow: { "0%,100%": { opacity: 0.5 }, "50%": { opacity: 1 } },
      },
      animation: {
        "fade-up": "fade-up .35s ease-out both",
        shimmer: "shimmer 1.4s infinite",
        glow: "glow 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
