/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src/tests'],
    testMatch: ['**/*.test.ts'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    setupFiles: ['<rootDir>/jest.setup.js'],
    clearMocks: true,
    verbose: true,
};
