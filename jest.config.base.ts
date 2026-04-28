export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  // Only transform .ts — skip .js files from compiled dist/ packages
  // ts-jest is told to use the service's tsconfig so it picks up the paths mapping
  // Only transform .ts — skip .js files from compiled dist/ packages
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  testEnvironment: 'node',
  // Map workspace packages to their TypeScript sources so ts-jest never needs compiled dist/ files.
  // rootDir = src/, so <rootDir>/../../../ resolves to the monorepo root — mirrors tsconfig.base.json paths.
  moduleNameMapper: {
    '^@fintech/shared-config$': '<rootDir>/../../../packages/shared-config/src/index.ts',
    '^@fintech/shared-logger$': '<rootDir>/../../../packages/shared-logger/src/index.ts',
    '^@fintech/shared-errors$': '<rootDir>/../../../packages/shared-errors/src/index.ts',
    '^@fintech/shared-prisma$': '<rootDir>/../../../packages/shared-prisma/src/index.ts',
    '^@fintech/shared-redis$': '<rootDir>/../../../packages/shared-redis/src/index.ts',
    '^@fintech/shared-queue$': '<rootDir>/../../../packages/shared-queue/src/index.ts',
    '^@fintech/shared-health$': '<rootDir>/../../../packages/shared-health/src/index.ts',
  },
};
