import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class', // Force dark mode via class instead of system preference
  theme: {
    extend: {}
  },
  plugins: [forms]
};
