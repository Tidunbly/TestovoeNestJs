module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: {
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
  },
  collectCoverage: true,
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.spec.ts',
    '!**/*.module.ts',
    '!**/main.ts',
  ],
};