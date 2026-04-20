import { Stack } from './stack/Stack.js';
import type {
  FactoryInstanceMap,
  Initializers,
  ModuleType,
  Resolver,
  Resolvers,
  ScopeType,
} from './types.js';
import {
  DependencyResolutionError as DRError,
  DependencyResolutionErrorCode as DRErrType,
} from './DependencyResolutionError.js';
import { getStore } from './async-scope.js';
import { propertyKeys } from './objects.js';
import { normalizeScope, overrideScope } from './scope.js';

const singletonInstances: FactoryInstanceMap = new Map();

export const createModule = <
  Pr extends object,
  Pb extends object,
  Params extends object,
>(
  privateResolvers: Resolvers<Pr, Pr & Pb, Params>,
  publicResolvers: Resolvers<Pb, Pr & Pb, Params>,
  initializers: Initializers<Pr & Pb, Params> | null,
  params: Params = {} as Params,
) => {
  type M = {
    [Item in keyof Pr | keyof Pb]: (Pr & Pb)[Item];
  };

  const resolvers = { ...privateResolvers, ...publicResolvers } as ModuleType<
    M,
    Params
  >;

  const resolutionStack = new Stack<keyof M>();
  const moduleInstances: FactoryInstanceMap = new Map();
  const publicNames: Set<PropertyKey> = new Set(propertyKeys(publicResolvers));
  let initializersToCall: Array<() => void>;

  const self = new Proxy(Object.create(null) as M, {
    get(_, prop) {
      return resolve(prop as keyof M);
    },
  });

  const ensureAsyncInstances = () => {
    const store = getStore();
    const asyncInstances = store.get(self);

    if (asyncInstances != null) return asyncInstances;

    const newInstances: FactoryInstanceMap = new Map();
    store.set(self, newInstances);
    return newInstances;
  };

  let transientInstances: FactoryInstanceMap;

  const getInstances = ({ scope }: Resolver<M, Params, unknown>) => {
    const normalizedScope = normalizeScope(scope);
    return (
      // prettier-ignore
      normalizedScope === 'async' ? ensureAsyncInstances() :
      normalizedScope === 'singleton' ? singletonInstances :
      normalizedScope === 'transient' ? transientInstances :
      moduleInstances
    );
  };

  const updateParentScope = (scope?: ScopeType) => {
    const parentItem = resolutionStack.peek();
    if (parentItem == null) return;
    const parent = resolvers[parentItem];
    const newParentScope = overrideScope(parent.scope, scope);
    if (newParentScope != null) parent.scope = newParentScope;
  };

  const resolve = <Item extends keyof M>(item: Item) => {
    const isTop = resolutionStack.length === 0;

    if (isTop) {
      transientInstances = new Map();
      initializersToCall = [];
    }

    const resolver = resolvers[item];

    if (resolver == null)
      throw new DRError(
        DRErrType.ResolverIsNotDefined,
        resolutionStack.toStringArray(),
        String(item),
      );

    const instances = getInstances(resolver);

    if (instances.has(item)) return instances.get(item);
    const currentStack = resolutionStack.toStringArray();
    try {
      resolutionStack.push(item);
    } catch {
      throw new DRError(
        DRErrType.CircularDependencyFailure,
        resolutionStack.toStringArray(),
        String(item),
      );
    }

    let instance: M[Item];

    try {
      instance = resolver(self, params);
    } catch (err) {
      if (err instanceof DRError) throw err;
      throw new DRError(
        DRErrType.InstantiationFailure,
        currentStack,
        String(item),
        err,
      );
    }

    resolutionStack.pop();

    updateParentScope(resolver.scope);

    getInstances(resolver).set(item, instance);

    const initializer: any = initializers?.[item];

    if (typeof initializer === 'function') {
      initializersToCall.push(() => {
        try {
          initializer.call(instance, self, params);
        } catch (err) {
          if (err instanceof DRError) throw err;
          throw new DRError(
            DRErrType.InitializationFailure,
            currentStack,
            String(item),
            err,
          );
        }
      });
    }

    if (isTop) {
      try {
        initializersToCall.forEach((init) => init());
      } finally {
        initializersToCall = [];
      }
    }

    return instance;
  };

  return new Proxy(Object.create(null) as Pb, {
    get(_, prop: PropertyKey) {
      if (publicNames.has(prop)) return resolve(prop as keyof M);
      throw new DRError(DRErrType.PrivateMemberAccessFailure, [], String(prop));
    },
  });
};
