export type Scope = 'singleton' | 'module';

export type ScopeType = Scope;

export type Resolver<M extends object, Params extends object, R> = {
  (injection: M, params: Params): R;
  scope?: Scope;
};

export type Resolvers<
  Items extends object,
  M extends object,
  Params extends object,
> = {
  [Item in keyof Items]: Resolver<M, Params, Items[Item]>;
};

export type ModuleType<M extends object, Params extends object> = {
  [Item in keyof M]: Resolver<M, Params, M[Item]>;
};

export type NotOf<T extends object> = Record<PropertyKey, unknown> & {
  [K in keyof T]?: never;
};

export type Initializers<M, Params> = {
  [Item in keyof M]?: (
    this: M[Item],
    module: Omit<M, Item>,
    params: Params,
  ) => void;
};

export type SomeImpl<M extends object> = {
  [key: string]: (self: M, ...args: never[]) => unknown;
};

export type MethodsOf<Impl extends SomeImpl<M>, M extends object> = {
  [key in keyof Impl]: Impl[key] extends (self: M, ...args: infer A) => infer R
    ? (...args: A) => R
    : never;
};

export interface IExtendable<
  Pr extends object,
  Pb extends object,
  Params extends object,
> {
  private<NPr extends NotOf<Pr & Pb>, NP extends object>(
    module: Resolvers<NPr, Pr & Pb, NP & Params>,
    scope?: ScopeType,
  ): ModuleBuilder<
    { [p in keyof (Pr & NPr)]: (Pr & NPr)[p] },
    Pb,
    { [p in keyof (Params & NP)]: (Params & NP)[p] }
  >;
  public<NPb extends NotOf<Pr & Pb>, NP extends object>(
    module: Resolvers<NPb, Pr & Pb, NP & Params>,
    scope?: ScopeType,
  ): ModuleBuilder<
    Pr,
    { [p in keyof (Pb & NPb)]: (Pb & NPb)[p] },
    { [p in keyof (Params & NP)]: (Params & NP)[p] }
  >;
  privateImpl<Impl extends SomeImpl<Pr & Pb>>(
    implementation: Impl,
  ): ModuleBuilder<
    {
      [p in keyof (Pr & MethodsOf<Impl, Pr & Pb>)]: (Pr &
        MethodsOf<Impl, Pr & Pb>)[p];
    },
    Pb,
    Params
  >;
  publicImpl<Impl extends SomeImpl<Pr & Pb>>(
    implementation: Impl,
  ): ModuleBuilder<
    Pr,
    {
      [p in keyof (Pb & MethodsOf<Impl, Pr & Pb>)]: (Pb &
        MethodsOf<Impl, Pr & Pb>)[p];
    },
    Params
  >;
  init(initializers: Initializers<Pr & Pb, Params>): ICreatable<Pb, Params>;
}

export type ICreatable<Pb extends object, Params extends object> =
  Record<PropertyKey, never> extends Params
    ? {
        create(): Pb;
      }
    : {
        create(params: Params): Pb;
      };

export type ModuleBuilder<
  Pr extends object,
  Pb extends object,
  Params extends object,
> = IExtendable<Pr, Pb, Params> & ICreatable<Pb, Params>;

export type FactoryInstanceMap = Map<PropertyKey, unknown>;
