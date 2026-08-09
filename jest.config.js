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
    // T2-22: un suelo, no una meta. Sin CI, la única barrera contra que la cobertura
    // se erosione es que `pnpm verify` falle aquí. Los valores reales del 2026-08-09
    // son 88.62 / 74.88 / 89.43 / 89.97; el umbral va unos puntos por debajo, que es
    // margen para un refactor honrado y no para el descuido. Al subir la cobertura,
    // subir también estos números.
    coverageThreshold: {
        global: {
            statements: 85,
            branches: 72,
            functions: 87,
            lines: 87,
        },
    },
};
