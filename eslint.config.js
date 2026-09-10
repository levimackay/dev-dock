import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // Security-relevant: these are the escape hatches that let untrusted
      // strings reach the DOM or the JS parser. Flag every one so it has to be
      // argued for in review.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-properties': [
        'error',
        {
          object: 'document',
          property: 'write',
          message: 'document.write is an XSS sink. Build DOM nodes instead.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // Unconditional on purpose. The first version of this rule tried to
          // express "unless DOMPurify is called in the same module" with an
          // esquery `:not()`, which cannot reason about other statements and,
          // as written, matched nothing at all: for a JSXAttribute,
          // `parent.parent.openingElement.attributes[0]` always exists, so the
          // negation was universally false and the rule was inert while
          // SECURITY.md claimed it as a control.
          //
          // Flagging every use and making the author argue for it in review is
          // both what the surrounding comment intended and the only thing a
          // selector can honestly do. There is exactly one use in this
          // codebase, in the markdown preview, and it carries a disable comment
          // pointing at the sanitizer.
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message:
            'dangerouslySetInnerHTML is an XSS sink. It is permitted only immediately downstream of DOMPurify.sanitize, with an eslint-disable comment naming the sanitizer.',
        },
      ],
    },
  },
  {
    // Tests and config are allowed to be looser about async/unsafe typing.
    files: ['**/*.test.{ts,tsx}', 'vitest.setup.ts', 'e2e/**/*.ts', '*.config.{ts,js}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
