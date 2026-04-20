import { describe, expect, it, jest } from '@jest/globals';
import Module, { scope } from './index';
import {
  DependencyResolutionError,
  DependencyResolutionErrorCode,
} from '../DependencyResolutionError';

describe('Light Module', () => {
  describe('basics', () => {
    it('resolves a dependency tree', () => {
      const main = Module()
        .private({
          b: () => 1,
        })
        .private({
          a: ({ b }: { b: number }) => b + 1,
        })
        .public({
          c: ({ a }: { a: number }) => a + 1,
        })
        .create();

      expect(main.c).toBe(3);
    });

    it('memoizes module-scoped resolvers per module instance', () => {
      const b = jest.fn(() => 1);
      const a = jest.fn(({ b }: { b: number }) => b + 1);
      const c = jest.fn(({ a }: { a: number }) => a + 1);

      const main = Module()
        .private({ b })
        .private({ a })
        .public({ c })
        .create();

      expect(main.c).toBe(3);
      expect(main.c).toBe(3);

      expect(b).toHaveBeenCalledTimes(1);
      expect(a).toHaveBeenCalledTimes(1);
      expect(c).toHaveBeenCalledTimes(1);
    });

    it('returns undefined when a dependency is missing (light version is lenient)', () => {
      const main = (Module as any)()
        .public({
          a: ({ b }: { b: number }) => b + 1,
        })
        .create();

      expect(main.a).toBeNaN();
    });

    it('wraps errors thrown by resolvers', () => {
      const main = Module()
        .public({
          a: () => {
            throw new Error('boom');
          },
        })
        .create();

      expect(() => main.a).toThrowError(
        new DependencyResolutionError(
          DependencyResolutionErrorCode.InstantiationFailure,
          [],
          'a',
          new Error('boom'),
        ),
      );
    });

    it('detects circular dependencies', () => {
      const main = (Module as any)()
        .public({
          a: ({ b }: { b: number }) => b + 1,
        })
        .public({
          b: ({ a }: { a: number }) => a + 1,
        })
        .create();

      expect(() => main.a).toThrowError(
        new DependencyResolutionError(
          DependencyResolutionErrorCode.CircularDependencyFailure,
          ['a', 'b'],
          'a',
        ),
      );
    });

    it('throws when accessing private members from the public module', () => {
      const main: Record<string, unknown> = Module()
        .private({
          secret: () => 42,
        })
        .create();

      expect(() => main.secret).toThrowError(
        new DependencyResolutionError(
          DependencyResolutionErrorCode.PrivateMemberAccessFailure,
          [],
          'secret',
        ),
      );
    });
  });

  describe('initializers', () => {
    it('runs initializers once resolution completes', () => {
      const main = (Module as any)()
        .public({
          config: () => ({ ready: false }),
        })
        .init({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          config(_module: any, params: any) {
            (this as any).ready = true;
            (this as any).mode = params.mode;
          },
        })
        .create({ mode: 'test' } as any);

      expect(main.config.ready).toBe(true);
      expect(main.config.mode).toBe('test');
    });

    it('runs dependency initializers mid-resolution', () => {
      const childInit = jest.fn();
      const parentInit = jest.fn();

      const main = Module()
        .private({
          child: () => ({ childReady: false }),
        })
        .public({
          parent: ({ child }: { child: { childReady: boolean } }) => ({
            get ready() {
              return child.childReady;
            },
            set ready(ready: boolean) {
              child.childReady = ready;
            },
          }),
        })
        .init({
          child() {
            this.childReady = false;
            childInit();
          },
          parent() {
            this.ready = true;
            parentInit();
          },
        })
        .create();

      expect(main.parent.ready).toBe(true);
      expect(childInit).toHaveBeenCalledTimes(1);
      expect(parentInit).toHaveBeenCalledTimes(1);
    });
  });

  describe('implementations', () => {
    it('exposes public implementations that can access module items', () => {
      const main = Module()
        .private({
          value: () => 2,
        })
        .publicImpl({
          double({ value }: { value: number }) {
            return value * 2;
          },
        })
        .create();

      expect(main.double()).toBe(4);
    });

    it('allows public implementations to consume private implementations', () => {
      const main = Module()
        .private({
          value: () => 3,
        })
        .privateImpl({
          square({ value }: { value: number }) {
            return value * value;
          },
        })
        .publicImpl({
          timesTwoSquare({ square }: { square: () => number }) {
            return square() * 2;
          },
        })
        .create();

      expect(main.timesTwoSquare()).toBe(18);
    });
  });

  describe('scopes', () => {
    it('creates new module-scoped instances per module', () => {
      const factory = jest.fn(() => ({ id: Math.random() }));
      const moduleBuilder = Module().public({ service: factory });

      const first = moduleBuilder.create();
      const second = moduleBuilder.create();

      expect(first.service).toBe(first.service);
      expect(second.service).toBe(second.service);
      expect(first.service).not.toBe(second.service);
      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('shares singleton-scoped instances across modules', () => {
      const factory = jest.fn(() => ({ id: Math.random() }));
      const moduleBuilder = Module().public(
        { service: factory },
        scope.singleton,
      );

      const first = moduleBuilder.create();
      const second = moduleBuilder.create();

      expect(first.service).toBe(second.service);
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });

  describe('guards', () => {
    it('prevents extending a module after initialization (public)', () => {
      const builder = Module()
        .public({ a: () => 1 })
        .init({
          a() {},
        });

      expect(() =>
        (builder as any).public({
          b: () => 2,
        }),
      ).toThrowError('Cannot extend initialized module');
    });

    it('prevents extending a module after creation (public)', () => {
      const builder = Module().public({ a: () => 1 });
      builder.create();

      expect(() =>
        (builder as any).public({
          b: () => 2,
        }),
      ).toThrowError('Cannot extend initialized module');
    });

    it('prevents extending a module after creation (private)', () => {
      const builder = Module().private({ a: () => 1 });
      builder.create();

      expect(() =>
        (builder as any).private({
          b: () => 2,
        }),
      ).toThrowError('Cannot extend initialized module');
    });

    it('prevents extending a module after creation (publicImpl)', () => {
      const builder = Module().publicImpl({ a: () => 1 });
      builder.create();

      expect(() =>
        (builder as any).publicImpl({
          b: () => 2,
        }),
      ).toThrowError('Cannot extend initialized module');
    });

    it('prevents extending a module after creation (privateImpl)', () => {
      const builder = Module().privateImpl({ a: () => 1 });
      builder.create();

      expect(() =>
        (builder as any).privateImpl({
          b: () => 2,
        }),
      ).toThrowError('Cannot extend initialized module');
    });

    it('prevents extending a module after initialization (private)', () => {
      const builder = Module()
        .private({ a: () => 1 })
        .init({
          a() {},
        });

      expect(() =>
        (builder as any).private({
          b: () => 2,
        }),
      ).toThrowError('Cannot extend initialized module');
    });

    it('prevents extending a module after initialization (implementations)', () => {
      const builder = Module()
        .publicImpl({
          a: () => 1,
        })
        .init({
          a() {},
        });

      expect(() =>
        (builder as any).publicImpl({
          b: () => 2,
        }),
      ).toThrowError('Cannot extend initialized module');
    });

    it('validates resolver types on registration', () => {
      expect(() =>
        Module()
          .public({
            a: 1 as any,
          })
          .create(),
      ).toThrowError('Expected a to be a function, but got number');
    });

    it('validates private resolver types on registration', () => {
      expect(() =>
        Module()
          .private({
            a: 1 as any,
          })
          .create(),
      ).toThrowError('Expected a to be a function, but got number');
    });
  });
});
