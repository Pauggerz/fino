module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'], // <--- This now does all the Reanimated magic automatically!
    plugins: [
      // WatermelonDB relies on legacy decorator syntax for @field / @relation / @children
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            '@': './src',
          },
        },
      ],
    ],
  };
};