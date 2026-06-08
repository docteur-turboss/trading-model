export default {
  parserPreset: {
    parserOpts: {
      headerPattern: /^(:\w+:|\p{Emoji})(?:\(([\w$.\-*/ ]+)\))?!?: (.+)$/u,
      headerCorrespondence: ['emoji', 'scope', 'subject'],
    },
  },
  rules: {
    'header-match-emoji-pattern': [2, 'always'],
    'scope-enum': [
      2,
      'always',
      [
        'auth',
        'scraper',
        'api',
        'wallet',
        'core',
        'deps',
        'discovery',
        'broker',
        'trainer',
        'router',
        'common',
        'config',
        'database',
        'middleware',
        'utils',
        'types',
        'address-manager',
        'message-manager',
        'financial-scraper',
        'trader-trainer',
        'discovery-server',
        'docs',
        'github-actions',
        'husky',
        'eslint',
        'release',
      ],
    ],
    'scope-case': [2, 'always', 'lowerCase'],
    'subject-empty': [2, 'never'],
    'subject-case': [0],
    'subject-full-stop': [2, 'never', '.'],
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
  },
  plugins: [
    {
      rules: {
        'header-match-emoji-pattern': ({ header }) => {
          const pattern = /^(:\w+:|\p{Emoji})(?:\(([\w$.\-*/ ]+)\))?!?: (.+)$/u;
          return [
            pattern.test(header),
            `Header must match Gitmoji format: "<gitmoji>(<scope>): <subject>"`,
          ];
        },
      },
    },
  ],
};
