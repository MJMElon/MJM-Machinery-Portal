/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Single calm accent on an otherwise white/grey UI.
        // Colour comes from CSS variables (index.css) so a module can change it:
        // Fuel Manage (.fuel-theme) uses the intranet's dark slate instead of blue.
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          dark: 'rgb(var(--brand-dark) / <alpha-value>)',
          light: 'rgb(var(--brand-light) / <alpha-value>)'
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
