module.exports = {
  extends: ['airbnb', 'prettier'],
  plugins: ['prettier', '@typescript-eslint'], // Add TS plugin
  parser: '@typescript-eslint/parser', // Add TS parser
  rules: {
    'prettier/prettier': ['error', { endOfLine: 'auto' }],
    'react/react-in-jsx-scope': 'off',
    'react/jsx-filename-extension': [1, { extensions: ['.ts', '.tsx'] }],
    'import/no-unresolved': 'off',
    'import/extensions': 'off',
    
    // Fixes 'styles' defined at bottom of file errors
    'no-use-before-define': 'off',
    '@typescript-eslint/no-use-before-define': ['error', { 'variables': false }],
    
    'react/style-prop-object': 'off',
    'camelcase': 'off',
    'import/no-extraneous-dependencies': 'off',
    
    // Optional: Fixes 'prop-types' errors since we use TypeScript interfaces instead
    'react/prop-types': 'off',
    'react/require-default-props': 'off',
    'react/function-component-definition': 'off',
    
'no-restricted-syntax': 'off',
'react/no-unstable-nested-components': ['error', { allowAsProps: true }],
'no-unused-vars': 'off', // Let TypeScript handle this instead
'@typescript-eslint/no-unused-vars': ['warn'],

    
  },
};
