export default {
  'packages/**/*.{ts,tsx,mts,mjs,css,json}': 'prettier --write',
  'packages/web/{app,components,lib}/**/*.{ts,tsx,mjs}': 'eslint --fix',
  'packages/{core,cli,ocr}/src/**/*.{ts,mjs}': 'eslint --fix',
};
