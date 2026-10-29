import { createAdapter } from './three'
import { boot } from './host/boot'

export const ready = boot({ three: createAdapter })
