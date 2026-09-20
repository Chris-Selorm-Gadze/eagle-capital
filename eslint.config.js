import js from '@eslint/js'
import globals from 'globals'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

/* Correctness only, not style.
 *
 * This config exists because a `useMemo` placed after a conditional return
 * survived a clean typecheck, a full test run and a production build — it would
 * have thrown the first time the dashboard flipped from empty to full, which is
 * the moment the worker journals a first trade. Nothing in the toolchain could
 * see it, because there was no linter at all.
 *
 * So the rules here are the ones that catch bugs a type checker cannot:
 * hook ordering, stale dependency arrays, unreachable or dead code. Formatting
 * and taste are left alone deliberately — this codebase is written by hand and
 * reads consistently already, and a style regime here would bury the findings
 * that matter under hundreds that do not.
 */
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'supabase/functions/**', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Accessibility findings are UX findings: a control with no name is one
      // nobody can reach by keyboard or screen reader, and a label pointing at
      // nothing is usually a field that does not focus when its label is
      // clicked -- which everyone notices, whether or not they know why.
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Type-checker's job, and it does it better.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-undef': 'off',

      // An unused variable is usually a rename that did not finish, or a value
      // someone meant to use. Args are exempt: a signature often has to match.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { args: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],

      // Real faults a type checker will not flag.
      'no-constant-binary-expression': 'error',
      'no-self-compare': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable-loop': 'error',
      'no-promise-executor-return': 'error',
      'no-await-in-loop': 'off',

      // Off deliberately. It cannot see that a closure variable is guarded by a
      // single-flight latch, so on this codebase it flagged four places and was
      // wrong about all four. A rule that is usually wrong teaches people to
      // add disable comments without reading them, which costs more than it
      // catches.
      'require-atomic-updates': 'off',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test-setup.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
)
