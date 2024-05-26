import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // @ts-expect-error seems like it's broken
  // eslint-disable-next-line
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
)
