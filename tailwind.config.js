/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx,html}', './src/renderer/index.html'],
  theme: {
    extend: {
      colors: {
        // Heat map scale for AIO position cells
        heat: {
          0: '#f8fafc',
          1: '#dbeafe',
          2: '#bfdbfe',
          3: '#93c5fd',
          4: '#60a5fa',
          5: '#3b82f6',
          6: '#2563eb',
          7: '#1d4ed8',
          8: '#1e40af',
          9: '#1e3a8a'
        }
      }
    }
  },
  plugins: []
}
