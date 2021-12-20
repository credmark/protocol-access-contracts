module.exports = {
  semi: true,
  singleQuote: false,
  printWidth: 120,
  overrides: [
    {
      files: ['*.ts', '*.js'],
      options: {
        semi: true,
        singleQuote: true,
        printWidth: 80,
      },
    },
  ],
};
