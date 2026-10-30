/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#002E6E', 900: '#001A40', 700: '#0A3D80' },
        sky: { DEFAULT: '#00BAF2', 50: '#E6F8FE', 100: '#CCF1FD' },
        ink: '#0F1B2D',
        canvas: '#EEF2F7',
        mute: '#5A6878',
        line: '#E3E8EF',
        ok: '#0E9F6E',
        warn: '#C2620F',
      },
      fontFamily: { sans: ['var(--font-sans)', 'system-ui', 'sans-serif'] },
      keyframes: {
        fillin: { '0%': { backgroundColor: '#CCF1FD' }, '100%': { backgroundColor: 'transparent' } },
        pulsering: { '0%': { boxShadow: '0 0 0 0 rgba(0,186,242,.6)' }, '100%': { boxShadow: '0 0 0 18px rgba(0,186,242,0)' } },
      },
      animation: { fillin: 'fillin 1.6s ease-out', pulsering: 'pulsering 1.2s ease-out infinite' },
    },
  },
  plugins: [],
};
