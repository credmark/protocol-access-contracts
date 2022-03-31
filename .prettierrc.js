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
    {
      files: "*.sol",
      options: {
        printWidth: 80,
        tabWidth: 4,
        useTabs: false,
        singleQuote: false,
        bracketSpacing: false,
        explicitTypes: "always"
      }
    }
  ]
};
