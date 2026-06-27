import { Stack } from '../stack/Stack.js';
import type {
  Initializers,
  ModuleBuilder,
  ModuleType,
  NotOf,
  Resolver,
  Resolvers,
  ScopeType,
  SomeImpl,
  MethodsOf,
} from './types.js';
import {
  DependencyResolutionError as DRError,
  DependencyResolutionErrorCode as DRErrType,
} from '../DependencyResolutionError.js';

export type {
  ScopeType,
  ModuleType,
  Resolver,
  Resolvers,
  Initializers,
  SomeImpl,
  ModuleBuilder,
  MethodsOf,
} 

export const scope = {
  module: 'module',
  singleton: 'singleton',
};

const createModule = <
  Pr extends object = { [key in never]: never },
  Pb extends object = { [key in never]: never },
  Params extends object = { [key in never]: never },
>(
  singletons: Map<keyof (Pr & Pb), any>,
  privateResolvers: Resolvers<Pr, Pr & Pb, Params>,
  publicResolvers: Resolvers<Pb, Pr & Pb, Params>,
  initializers: Initializers<Pr & Pb, Params>,
  params: Params,
): Pb => {
  type Name = keyof (Pr & Pb);
  type M = {
    [Item in keyof Pr | keyof Pb]: (Pr & Pb)[Item];
  };

  const resolvers = { ...privateResolvers, ...publicResolvers } as ModuleType<
    M,
    Params
  >;

  const resolutionStack = new Stack<keyof M>();
  const moduleInstances = new Map<Name, any>();

  const self = {} as Pr & Pb;
  const module = {} as Pb;

  for (const name of Object.keys(privateResolvers) as Name[]) {
    Object.defineProperty(self, name, {
      get: () => resolve(name),
    });

    Object.defineProperty(module, name, {
      get: () => {
        throw new DRError(
          DRErrType.PrivateMemberAccessFailure,
          resolutionStack.toStringArray(),
          String(name),
        );
      },
    });
  }

  for (const name of Object.keys(publicResolvers) as (keyof Pb)[]) {
    Object.defineProperty(self, name, {
      get: () => resolve(name),
    });

    Object.defineProperty(module, name, {
      get: () => resolve(name),
    });
  }

  const resolve = (name: Name) => {
    const resolver = resolvers[name];

    const instances =
      resolver.scope === 'singleton' ? singletons : moduleInstances;

    if (instances.has(name)) return instances.get(name);

    const currentStack = resolutionStack.toStringArray();

    try {
      resolutionStack.push(name);
    } catch {
      throw new DRError(
        DRErrType.CircularDependencyFailure,
        resolutionStack.toStringArray(),
        String(name),
      );
    }

    let instance: any;

    try {
      instance = resolver(self, params);
    } catch (err) {
      if (err instanceof DRError) throw err;
      throw new DRError(
        DRErrType.InstantiationFailure,
        currentStack,
        String(name),
        err,
      );
    }

    resolutionStack.pop();

    instances.set(name, instance);

    if (resolutionStack.length === 0) {
      (initializers[name] as any)?.call(instance, self, params);
    }

    return instance;
  };

  return module;
};

export const Module = <
  Pr extends object = { [key in never]: never },
  Pb extends object = { [key in never]: never },
  Params extends object = { [key in never]: never },
>(): ModuleBuilder<Pr, Pb, Params> => {
  const privateResolvers = {} as Resolvers<Pr, Pr & Pb, Params>;
  const publicResolvers = {} as Resolvers<Pb, Pr & Pb, Params>;
  let initializers = null as Initializers<Pr & Pb, Params> | null;
  let sealed = false;
  const singletons = new Map<keyof (Pr & Pb), (Pr & Pb)[keyof (Pr & Pb)]>();

  const self = {
    private<NPr extends NotOf<Pr & Pb>, NP extends object>(
      resolvers: Resolvers<NPr, Pr & Pb, NP & Params>,
      scope?: ScopeType,
    ) {
      if (sealed) {
        throw new Error('Cannot extend initialized module');
      }

      for (const name of Object.keys(resolvers) as (keyof NPr)[]) {
        const resolver = resolvers[name];
        if (typeof resolver !== 'function') {
          throw new Error(
            `Expected ${String(name)} to be a function, but got ${typeof resolver}`,
          );
        }
        resolver.scope ??= scope;
        (privateResolvers as any)[name] = resolver;
      }

      return self as unknown;
    },

    privateImpl<Impl extends SomeImpl<Pr & Pb>>(implementation: Impl) {
      if (sealed) {
        throw new Error('Cannot extend initialized module');
      }

      for (const name of Object.keys(implementation) as (keyof Impl)[]) {
        const method = implementation[name];

        const resolver =
          (moduleInstance: Pr & Pb) =>
          (...args: never[]) =>
            method(moduleInstance, ...args);

        resolver.scope = 'module';

        (privateResolvers as any)[name] = resolver;
      }

      return self as unknown;
    },

    public<NPb extends NotOf<Pr & Pb>, NP extends object>(
      resolvers: Resolvers<NPb, Pr & Pb, NP & Params>,
      scope?: ScopeType,
    ) {
      if (sealed) {
        throw new Error('Cannot extend initialized module');
      }

      for (const name of Object.keys(resolvers) as (keyof NPb)[]) {
        const resolver = resolvers[name];
        if (typeof resolver !== 'function') {
          throw new Error(
            `Expected ${String(name)} to be a function, but got ${typeof resolver}`,
          );
        }
        resolver.scope ??= scope;
        (publicResolvers as any)[name] = resolver;
      }

      return self;
    },

    publicImpl<Impl extends SomeImpl<Pr & Pb>>(implementation: Impl) {
      if (sealed) {
        throw new Error('Cannot extend initialized module');
      }
      for (const name of Object.keys(implementation) as (keyof Impl)[]) {
        const method = implementation[name];

        const resolver =
          (moduleInstance: Pr & Pb) =>
          (...args: never[]) =>
            method(moduleInstance, ...args);

        resolver.scope = 'module';

        (publicResolvers as any)[name] = resolver;
      }

      return self;
    },

    init(initializer: Initializers<Pr & Pb, Params>) {
      initializers = initializer;
      sealed = true;
      return self;
    },

    create(params: Params = {} as Params): Pb {
      sealed = true;
      return createModule<Pr, Pb, Params>(
        singletons,
        privateResolvers,
        publicResolvers,
        initializers ?? {},
        params,
      );
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return self as any;
};

export default Module;
