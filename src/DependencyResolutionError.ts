export enum DependencyResolutionErrorCode {
  PrivateMemberAccessFailure = 'PrivateMemberAccessFailure',
  CircularDependencyFailure = 'CircularDependencyFailure',
  ResolverIsNotDefined = 'ResolverIsNotDefined',
  InstantiationFailure = 'InstantiationFailure',
  InitializationFailure = 'InitializationFailure',
}

export class DependencyResolutionError extends Error {
  constructor(
    public readonly code: DependencyResolutionErrorCode,
    public readonly resolutionStack: string[],
    public readonly item: string,
    cause?: unknown,
  ) {
    const stackMessage =
      resolutionStack.length > 0
        ? ` with stack ${resolutionStack.map((parent) => `<${parent}>`).join(' <- ')}`
        : '';

    super(`${code} in attempting to resolve <${item}>${stackMessage}`, {
      cause,
    });
  }
}
