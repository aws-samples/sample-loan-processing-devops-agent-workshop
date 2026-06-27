/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        status: {
          active: '#10b981',
          verified: '#10b981',
          paid: '#10b981',
          pending: '#f59e0b',
          due: '#f59e0b',
          upcoming: '#f59e0b',
          rejected: '#ef4444',
          overdue: '#ef4444',
          submitted: '#3b82f6',
          'under-review': '#3b82f6',
          draft: '#6b7280',
          closed: '#6b7280',
        },
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
    },
  },
  plugins: [],
};
