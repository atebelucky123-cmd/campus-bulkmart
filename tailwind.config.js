module.exports = {
  content: [
    "./*.html",
    "./src/**/*.html",
    "./src/**/*.js",
    "./*.js",
  ],
  theme: {
    extend: {
      colors: {
        navy: "#000080",
        "matte-black": "#1A1A1A",
        "olive-green": "#3B592D",
        "cool-gray": "#F4F4F4",
        "electric-blue": "#007BFF",
      },
      fontFamily: {
        outfit: ["Outfit", "sans-serif"],
        montserrat: ["Montserrat", "sans-serif"],
      },
    },
  },
  plugins: [],
}
