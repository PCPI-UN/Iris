import 'reflect-metadata';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { ROUTE_POLICY, RouteAccess } from './route-policy';

/**
 * Compares the decorators of every gateway controller with ROUTE_POLICY, so who can call
 * an endpoint only changes on purpose (CU-86e3vmxav).
 */

interface DeclaredRoute {
  key: string;
  isPublic: boolean;
  permissions: string[];
}

const SRC = join(__dirname, '..', '..');

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return controllerFiles(path);
    return name.endsWith('.controller.ts') ? [path] : [];
  });
}

function joinPath(...parts: (string | string[] | undefined)[]): string {
  const segments = parts
    .map((part) => (Array.isArray(part) ? part[0] : part) ?? '')
    .flatMap((part) => part.split('/'))
    .filter((segment) => segment.length > 0);
  return '/' + segments.join('/');
}

function declaredRoutes(): DeclaredRoute[] {
  const routes: DeclaredRoute[] = [];

  for (const file of controllerFiles(SRC)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exported = require(file) as Record<string, unknown>;

    for (const controller of Object.values(exported)) {
      if (typeof controller !== 'function') continue;
      const controllerPath = Reflect.getMetadata(PATH_METADATA, controller) as string | string[] | undefined;
      if (controllerPath === undefined) continue;

      const classPublic = Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
      const classPermissions = (Reflect.getMetadata(PERMISSIONS_KEY, controller) as string[] | undefined) ?? [];
      const prototype = controller.prototype as Record<string, unknown>;

      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined) continue;

        const handlerPermissions = Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[] | undefined;
        routes.push({
          key: `${RequestMethod[method]} ${joinPath(controllerPath, Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined)}`,
          isPublic: Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true || classPublic,
          // Same precedence as the guard (getAllAndOverride): handler first, then class
          permissions: handlerPermissions ?? classPermissions,
        });
      }
    }
  }

  return routes;
}

function describeDeclared(route: DeclaredRoute): RouteAccess {
  if (route.isPublic) return { access: 'public' };
  if (route.permissions.length > 0) return { permission: [...route.permissions].sort() };
  return { access: 'pending' };
}

function normalize(access: RouteAccess): RouteAccess {
  if ('permission' in access) return { permission: [...access.permission].sort() };
  // `session` and `pending` are the same for the guard: only a session is required
  if (access.access === 'session') return { access: 'pending' };
  return access;
}

describe('Route access policy', () => {
  const routes = declaredRoutes();

  it('finds the endpoints of the gateway', () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it('lists every endpoint in ROUTE_POLICY', () => {
    const missing = routes.map((route) => route.key).filter((key) => !(key in ROUTE_POLICY));

    expect(missing).toEqual([]);
  });

  it('does not keep endpoints that no longer exist', () => {
    const declared = new Set(routes.map((route) => route.key));
    const stale = Object.keys(ROUTE_POLICY).filter((key) => !declared.has(key));

    expect(stale).toEqual([]);
  });

  it('matches the decorators of every endpoint', () => {
    const mismatches = routes
      .filter((route) => route.key in ROUTE_POLICY)
      .filter(
        (route) =>
          JSON.stringify(describeDeclared(route)) !== JSON.stringify(normalize(ROUTE_POLICY[route.key])),
      )
      .map((route) => ({
        endpoint: route.key,
        decorators: describeDeclared(route),
        policy: ROUTE_POLICY[route.key],
      }));

    expect(mismatches).toEqual([]);
  });

  it('explains every endpoint that only requires a session', () => {
    const unexplained = Object.entries(ROUTE_POLICY)
      .filter(([, access]) => 'access' in access && access.access === 'session' && !access.why)
      .map(([key]) => key);

    expect(unexplained).toEqual([]);
  });
});
