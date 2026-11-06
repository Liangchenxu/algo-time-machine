/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      spacing: {
        // 工作台标记使用了标度外的 h-13（52px 火焰图时间轨）与 py-0.2（微型徽章）
        13: '3.25rem',
        '0.2': '0.05rem',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          950: '#05070d',
          900: '#0a0f1a',
          850: '#0e1524',
          800: '#131c2e',
          700: '#1c2740',
          600: '#2a3a5c',
        },
        neon: {
          cyan: '#22d3ee',
          blue: '#3b82f6',
          violet: '#a78bfa',
          lime: '#a3e635',
          amber: '#fbbf24',
          rose: '#fb7185',
        },
      },
      boxShadow: {
        glow: '0 0 18px rgba(34, 211, 238, 0.35)',
        'glow-lg': '0 0 32px rgba(59, 130, 246, 0.45)',
      },
      keyframes: {
        pulseRing: {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        pulseRing: 'pulseRing 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
