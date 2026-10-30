/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "var(--app-bg)",
          surface: "var(--app-surface)",
          "surface-secondary": "var(--app-surface-secondary)",
          border: "var(--app-border)",
          "border-subtle": "var(--app-border-subtle)",
          "accent-green": "var(--app-accent-green)",
          "accent-green-dark": "var(--app-accent-green-dark)",
          "text-primary": "var(--app-text-primary)",
          "text-secondary": "var(--app-text-secondary)",
          "text-muted": "var(--app-text-muted)",
          warning: "var(--app-warning)",
          error: "var(--app-error)",
          info: "var(--app-info)",
          toolhead0: "var(--app-toolhead-t0)",
          toolhead1: "var(--app-toolhead-t1)",
          bed: "var(--app-bed-heat)",
          chamber: "var(--app-chamber)",
        },
      },
      borderRadius: {
        card: "var(--app-card-radius)",
      },
    },
  },
  plugins: [],
};
