import next from 'eslint-config-next';

const config = [
  ...next,
  {
    rules: {
      // The API's DTO types are generated; hand-writing one is the drift AD-12 exists to prevent.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/types/api.d.ts'],
              message: 'Import generated API types through @/types/api instead.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'src/types/api.d.ts', 'playwright-report/**'],
  },
];

export default config;
