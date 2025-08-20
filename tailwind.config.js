/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',                 // ← 중요
  content: [
    "./index.html",
    "./**/*.html",
    "./**/*.js"
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}