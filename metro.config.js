// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Inline requires — Messenger/Discord cold-start pattern. Modules are required
// lazily at first access instead of eagerly at bundle parse, cutting initial
// JS parse time on Hermes. Expo ships this off by default; opt in.
//
// Safe because:
//   - db/index.ts runs its side effect (DB open) on first read of `database`,
//     which happens during App.tsx mount — still before any screen needs it.
//   - WatermelonDB legacy decorators bind at class definition, not import.
//   - No modules in src/ capture other modules' exports at parse-time as
//     module-level `const`s, which is the pattern that would break.
const prev = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async (...args) => {
  const base = prev ? await prev(...args) : {};
  return {
    ...base,
    transform: {
      ...(base.transform ?? {}),
      experimentalImportSupport: base.transform?.experimentalImportSupport ?? false,
      inlineRequires: true,
    },
  };
};

module.exports = config;
