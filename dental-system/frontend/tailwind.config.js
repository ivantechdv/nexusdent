/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        clinic: {
          ink: '#0f172a',
          deep: 'rgb(var(--clinic-deep) / <alpha-value>)',
          slate: '#334155',
          soft: '#e2e8f0',
          surface: '#f8fafc',
        },
        accent: {
          DEFAULT: '#f97316',
          hover: '#ea580c',
          soft: '#ffedd5',
        },
        odontogram: {
          required: '#dc2626',
          treated: '#2563eb',
          missing: '#374151',
          progress: '#16a34a',
          healthy: '#f1f5f9',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"Outfit"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 1px 3px rgba(15, 23, 42, 0.08), 0 8px 24px rgba(15, 23, 42, 0.06)',
      },
    },
  },
  plugins: [],
};
