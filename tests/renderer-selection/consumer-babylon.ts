import { createAdapter } from './babylon'
import { boot } from './host/boot'

export const ready = boot({ babylon: createAdapter })
