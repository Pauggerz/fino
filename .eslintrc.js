module.exports = {
  extends: ['airbnb', 'prettier'],
  plugins: ['prettier', '@typescript-eslint', 'react-hooks'], // Add TS plugin
  parser: '@typescript-eslint/parser', // Add TS parser
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  globals: {
    __DEV__: 'readonly',
  },
  rules: {
    'prettier/prettier': ['error', { endOfLine: 'auto' }],
    'react/react-in-jsx-scope': 'off',
    'react/jsx-filename-extension': [1, { extensions: ['.ts', '.tsx'] }],
    'import/no-unresolved': 'off',
    'import/extensions': 'off',

    // Fixes 'styles' defined at bottom of file errors
    'no-use-before-define': 'off',
    '@typescript-eslint/no-use-before-define': ['error', { variables: false }],

    'react/style-prop-object': 'off',
    camelcase: 'off',
    'import/no-extraneous-dependencies': 'off',

    // Optional: Fixes 'prop-types' errors since we use TypeScript interfaces instead
    'react/prop-types': 'off',
    'react/require-default-props': 'off',
    'react/function-component-definition': 'off',

    'no-restricted-syntax': 'off',
    'react/no-unstable-nested-components': ['error', { allowAsProps: true }],
    'no-unused-vars': 'off', // Let TypeScript handle this instead
    '@typescript-eslint/no-unused-vars': ['warn'],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-nested-ternary': 'off',
    'react/no-array-index-key': 'off',
    'react/jsx-props-no-spreading': 'off',
    'react/destructuring-assignment': 'off',
    'react/state-in-constructor': 'off',
    'import/prefer-default-export': 'off',
    'no-plusplus': 'off',
    'no-shadow': 'off',
    // WatermelonDB's public API exposes `_raw`, `_changed`, `_status` on Model
    // instances — these underscore names are mandatory, not stylistic.
    'no-underscore-dangle': ['error', { allow: ['_raw', '_changed', '_status'] }],
    'no-bitwise': 'off',
    'consistent-return': 'off',
    radix: 'off',
    'no-promise-executor-return': 'off',
    'react-hooks/exhaustive-deps': 'off',
    'import/no-duplicates': 'off',
    'react/jsx-no-constructed-context-values': 'off',
    '@typescript-eslint/no-use-before-define': 'off',
  },
};
