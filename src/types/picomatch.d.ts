declare module 'picomatch' {
  export interface PicomatchOptions {
    dot?: boolean;
  }

  export type PicomatchMatcher = (_input: string) => boolean;

  interface Picomatch {
    (_glob: string | readonly string[], _options?: PicomatchOptions): PicomatchMatcher;
  }

  const picomatch: Picomatch;
  export default picomatch;
}
