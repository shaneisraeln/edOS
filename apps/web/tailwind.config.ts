import type { Config } from 'tailwindcss';

/**
 * edOS design tokens.
 *
 * Key names are deliberately preserved (primary-*, surface-*, dark-*) because
 * pages across the app reference them directly. Only the values are tuned.
 *
 * `gray` is overridden with a neutral (non-blue) ramp. Every page already uses
 * gray-* utilities heavily, so tuning it here lifts the whole app at once.
 *
 * Font: a native system stack rather than a webfont. The previous config listed
 * 'Inter' first but nothing ever loaded it, so text silently fell back to
 * system-ui anyway. Using the system stack on purpose keeps rendering native on
 * both macOS and Windows, adds no network request, and removes a build-time
 * dependency on Google Fonts.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Neutral ramp — warm-neutral, no blue cast.
        gray: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e7e7ea',
          300: '#d3d3d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#26262b',
          900: '#18181b',
          950: '#0f0f11',
        },
        primary: {
          50: '#f2f5fd',
          100: '#e4eafb',
          200: '#c9d5f6',
          300: '#a3b8ef',
          400: '#7c9cf0',
          500: '#5079e0',
          600: '#3564d4',
          700: '#2b53b4',
          800: '#264794',
          900: '#233d78',
        },
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#fbfbfc',
          tertiary: '#f4f4f5',
        },
        dark: {
          DEFAULT: '#0f0f11',
          surface: '#17171a',
          tertiary: '#1f1f23',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI Variable Text',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'SF Mono',
          'Cascadia Mono',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        // Tighter, more deliberate type scale for dense dashboard UI.
        '2xs': ['11px', { lineHeight: '1.45' }],
        xs: ['12px', { lineHeight: '1.5' }],
        sm: ['13px', { lineHeight: '1.55' }],
        base: ['14px', { lineHeight: '1.6' }],
        lg: ['16px', { lineHeight: '1.5' }],
        xl: ['18px', { lineHeight: '1.4' }],
        '2xl': ['22px', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        '3xl': ['28px', { lineHeight: '1.22', letterSpacing: '-0.02em' }],
        '4xl': ['34px', { lineHeight: '1.15', letterSpacing: '-0.025em' }],
        '5xl': ['44px', { lineHeight: '1.08', letterSpacing: '-0.03em' }],
      },
      borderRadius: {
        lg: '9px',
        xl: '11px',
        '2xl': '13px',
      },
      boxShadow: {
        // Restrained elevation — used only for overlays/popovers.
        pop: '0 8px 24px -6px rgb(0 0 0 / 0.12), 0 2px 6px -2px rgb(0 0 0 / 0.06)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.18s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
