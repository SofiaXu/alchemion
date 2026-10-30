const executable = process.env.npm_execpath
if (!executable) throw new Error('Use pnpm to invoke this task.')

// pnpm 12 exposes a native executable rather than a Node.js module.
export const pnpmCommand = (args) => [executable, args]
