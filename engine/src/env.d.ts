/**
 * Minimal ambient shim for the two `process.env.NODE_ENV` reads inside upstream
 * `@use-gesture` core. Declared here rather than pulling in `@types/node`, which
 * would leak Node globals into a browser-only library and change how consumers'
 * editors type-check DOM code.
 */
declare const process: { env: { NODE_ENV?: string } }
