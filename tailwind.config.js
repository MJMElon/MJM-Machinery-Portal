/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Single calm accent on an otherwise white/grey UI.
        brand: {
          DEFAULT: '#2563eb',
          dark: '#1d4ed8',
          light: '#eff6ff'
        }
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", 'system-ui', '-apple-system', "'Segoe UI'", 'Roboto', 'sans-serif'],
        // Titles and CMMS navigation
        display: ["'Sora'", "'Plus Jakarta Sans'", 'system-ui', 'sans-serif']
      },
      maxWidth: {
        app: '520px'
      }
    }
  },
  plugins: []
}
