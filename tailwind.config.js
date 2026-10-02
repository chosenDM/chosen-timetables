/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/index.html", "./client/src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#1461C4",
          orange: "#F57231",
          green: "#2F7419",
        },
      },
    },
  },
  plugins: [],
};
