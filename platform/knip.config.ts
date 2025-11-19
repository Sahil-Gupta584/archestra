import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  exclude: ["dependencies", "devDependencies"],
  ignore: ["e2e-tests", "**/*.gen.ts", "experiments", "examples"],
  ignoreBinaries: ["kubectl"],
  workspaces: {
    "backend": {
      project: ["**/*.ts"],
    },
    "frontend": {
      project: ["**/*.ts"],
      ignoreFiles: ["frontend/components/**/*.ts(x)?"],
      ignoreDependencies: ["postcss"]
    },
    "shared": {
      project: ["**/*.ts"],
    },
  }
};

export default config;
