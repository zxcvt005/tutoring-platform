/**
 * PostCSS для Next.js Webpack.
 * Плагины задаются строками (требование Next), не через import()/require() функции.
 * Пакет `@tailwindcss/postcss` должен быть в dependencies — иначе падает Linux-сборка
 * при `npm ci --omit=dev`.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
