declare module "circomlibjs" {
  export function buildPoseidon(): Promise<{
    F: {
      e: (value: bigint) => unknown;
      toString: (value: unknown) => string;
    };
    (inputs: unknown[]): unknown;
  }>;
}
