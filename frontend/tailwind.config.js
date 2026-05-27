export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        gold: {
          300: '#f5d76e',
          400: '#e8c547',
          500: '#d4af37',
          600: '#b8962e',
          700: '#9a7d26',
        },
        navy: {
          600: '#2d3748',
          700: '#1f2937',
          800: '#111827',
          900: '#0a0e1a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif']
      }
    }
  },
  plugins: []
}
