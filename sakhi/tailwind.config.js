/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm, voice-first palette (UX redesign 2026-11-01). Contrast checked: brand on white 5.4:1,
        // white on brand 5.4:1, muted on paper 7.1:1, leaf on leaf-soft 5.3:1, rose on rose-soft 5.9:1.
        ink: '#2A1A12',
        muted: '#5E4B3F',
        paper: '#FFF6EA',
        card: '#FFFFFF',
        line: '#EBD9C6',
        brand: { DEFAULT: '#B34A1D', dark: '#8C3511', soft: '#FCE9DC' },
        marigold: { DEFAULT: '#E8892B', soft: '#FDEFD9' },
        // "Needs practice / try again": a calm rose, distinct from the orange brand (never red alarm).
        clay: { DEFAULT: '#8E3B5E', soft: '#F7E4EC' },
        leaf: { DEFAULT: '#2A6E2D', soft: '#E5F3E5' },
        disabled: { DEFAULT: '#E9D3C4', ink: '#7A5A48' },
      },
      fontFamily: {
        sans: ['"Noto Sans"', '"Noto Sans Devanagari"', '"Noto Sans Telugu"', '"Noto Sans Bengali"', '"Noto Sans Tamil"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
