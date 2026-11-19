import { readdirSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import * as ts from 'typescript';
import { pathsToModuleNameMapper } from 'ts-jest';

/**
 * One Jest project per service. Each service has its own path aliases in its
 * tsconfig.app.json, and some aliases repeat with different targets (`@common/*` is
 * src/common of auth-service, evaluation-service, event-service...), so a single
 * moduleNameMapper at the root cannot serve them all. libs/ and scripts/ use the root ones.
 */
type Paths = Record<string, string[]>;

const rootDir = __dirname;

const readCompilerOptions = (file: string): { baseUrl?: string; paths?: Paths } =>
  ts.readConfigFile(file, ts.sys.readFile).config?.compilerOptions ?? {};

const specOptions = readCompilerOptions(join(rootDir, 'tsconfig.spec.json'));
const rootPaths: Paths = specOptions.paths ?? {};

/** Aliases of a service, relative to the repository root, on top of the root ones */
const servicePaths = (service: string): Paths => {
  const file = join(rootDir, 'apps', service, 'tsconfig.app.json');
  const { baseUrl = '.', paths = {} } = readCompilerOptions(file);
  const base = resolve(dirname(file), baseUrl);
  const own = Object.fromEntries(
    Object.entries(paths).map(([alias, targets]) => [
      alias,
      targets.map((target) => relative(rootDir, resolve(base, target))),
    ]),
  );
  return { ...rootPaths, ...own };
};

const project = (displayName: string, roots: string[], paths: Paths) => ({
  displayName,
  rootDir,
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testMatch: roots.map((root) => `<rootDir>/${root}/**/*.spec.ts`),
  transform: {
    // An object replaces the compilerOptions of tsconfig.json for this project
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: { ...specOptions, baseUrl: rootDir, paths } }],
  },
  moduleNameMapper: pathsToModuleNameMapper(paths, { prefix: '<rootDir>/' }),
});

const services = readdirSync(join(rootDir, 'apps'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

export default {
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: './coverage',
  projects: [
    ...services.map((service) => project(service, [`apps/${service}`], servicePaths(service))),
    project('libs', ['libs', 'scripts'], rootPaths),
  ],
};
