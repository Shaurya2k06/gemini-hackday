/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'matte-base': 'var(--matte-base)',
        'surface-elevate': 'var(--surface-elevate)',
        'primary-typography': 'var(--primary-typography)',
        'secondary-typography': 'var(--secondary-typography)',
        'accent-precision': 'var(--accent-precision)',
        'subtle-glow': 'var(--subtle-glow)',
        
        // shadcn compatibility colors using hex-based css variables
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        // Structured Specific Colors
        putty: "var(--color-putty)",
        ink: "var(--color-ink)",
        bone: "var(--color-bone)",
        chalk: "var(--color-chalk)",
        vellum: "var(--color-vellum)",
        graphite: "var(--color-graphite)",
        ash: "var(--color-ash)",
        paper: "var(--color-paper)",
      },
      fontFamily: {
        'advercase': ['Advercase', 'system-ui', 'sans-serif'],
        'davinci': ['var(--font-davinci)', 'serif'],
        'helvetica-now': ['var(--font-helvetica-now)', 'sans-serif'],
      },
      animation: {
        'grid': 'grid 20s linear infinite',
        'pulse-slow': 'pulse-slow 8s ease-in-out infinite',
        'border-flow': 'border-flow 3s linear infinite',
        'pulse-border': 'pulse-border 2s ease-in-out infinite',
        'gradient-x': 'gradient-x 15s ease infinite',
        'marquee': 'marquee 25s linear infinite',
      },
      keyframes: {
        grid: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(60px)' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.05)' },
        },
        'border-flow': {
          '0%': { left: '-30%' },
          '100%': { left: '100%' },
        },
        'pulse-border': {
          '0%, 100%': { borderColor: 'rgba(0, 239, 166, 0)', transform: 'scale(1)' },
          '50%': { borderColor: 'rgba(0, 239, 166, 0.3)', transform: 'scale(1.02)' },
        },
        'gradient-x': {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        }
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
}
