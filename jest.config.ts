export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: './coverage',
  moduleNameMapper: {
    '^@app/common$': '<rootDir>/libs/common/src',
    '^@app/common/(.*)$': '<rootDir>/libs/common/src/$1',
    '^@app/(.*)$': '<rootDir>/libs/$1',
    '^@criterions/(.*)$': '<rootDir>/apps/evaluation-service/src/modules/criterions/$1',
    '^@evaluations/(.*)$': '<rootDir>/apps/evaluation-service/src/modules/evaluations/$1',
  },
};
