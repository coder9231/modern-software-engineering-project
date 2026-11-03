export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'reports/**', 'website/**', 'packages/web/**'] },
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-constant-binary-expression': 'error',
      'no-unreachable': 'error',
      'no-dupe-args': 'error',
      'constructor-super': 'error',
    },
  },
];
