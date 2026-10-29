export class Color {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
  constructor(red: number, green: number, blue: number, alpha = 1) {
    this.red = red
    this.green = green
    this.blue = blue
    this.alpha = alpha
  }
}
export interface IColorMap {
  get(key: string | number): Color
}

export class AtomColorMap implements IColorMap {
  private _array: Color[] = [
    {
      red: 0.07,
      green: 0.5,
      blue: 0.7,
      alpha: 1
    },
    {
      red: 0.75,
      green: 0.75,
      blue: 0.75,
      alpha: 1
    },
    {
      red: 0.85,
      green: 1.0,
      blue: 1.0,
      alpha: 1
    },
    {
      red: 0.8,
      green: 0.5,
      blue: 1.0,
      alpha: 1
    },
    {
      red: 0.76,
      green: 1.0,
      blue: 0.0,
      alpha: 1
    },
    {
      red: 1.0,
      green: 0.71,
      blue: 0.71,
      alpha: 1
    },
    {
      red: 0.4,
      green: 0.4,
      blue: 0.4,
      alpha: 1
    },
    {
      red: 0.05,
      green: 0.05,
      blue: 1.0,
      alpha: 1
    },
    {
      red: 1.0,
      green: 0.05,
      blue: 0.05,
      alpha: 1
    },
    {
      red: 0.5,
      green: 0.7,
      blue: 1.0,
      alpha: 1
    },
    {
      red: 0.7,
      green: 0.89,
      blue: 0.96,
      alpha: 1
    },
    {
      red: 0.67,
      green: 0.36,
      blue: 0.95,
      alpha: 1
    },
    {
      red: 0.54,
      green: 1.0,
      blue: 0.0,
      alpha: 1
    },
    {
      red: 0.75,
      green: 0.65,
      blue: 0.65,
      alpha: 1
    },
    {
      red: 0.5,
      green: 0.6,
      blue: 0.6,
      alpha: 1
    },
    {
      red: 1.0,
      green: 0.5,
      blue: 0.0,
      alpha: 1
    },
    {
      red: 0.7,
      green: 0.7,
      blue: 0.0,
      alpha: 1
    },
    {
      red: 0.12,
      green: 0.94,
      blue: 0.12,
      alpha: 1
    },
    {
      red: 0.5,
      green: 0.82,
      blue: 0.89,
      alpha: 1
    },
    {
      red: 0.56,
      green: 0.25,
      blue: 0.83,
      alpha: 1
    },
    {
      red: 0.24,
      green: 1.0,
      blue: 0.0,
      alpha: 1
    },
    {
      red: 0.9,
      green: 0.9,
      blue: 0.9,
      alpha: 1
    },
    {
      red: 0.75,
      green: 0.76,
      blue: 0.78,
      alpha: 1
    },
    {
      red: 0.65,
      green: 0.65,
      blue: 0.67,
      alpha: 1
    },
    {
      red: 0.54,
      green: 0.6,
      blue: 0.78,
      alpha: 1
    },
    {
      red: 0.61,
      green: 0.48,
      blue: 0.78,
      alpha: 1
    },
    {
      red: 0.88,
      green: 0.4,
      blue: 0.2,
      alpha: 1
    },
    {
      red: 0.94,
      green: 0.56,
      blue: 0.63,
      alpha: 1
    },
    {
      red: 0.31,
      green: 0.82,
      blue: 0.31,
      alpha: 1
    },
    {
      red: 0.78,
      green: 0.5,
      blue: 0.2,
      alpha: 1
    },
    {
      red: 0.49,
      green: 0.5,
      blue: 0.69,
      alpha: 1
    },
    {
      red: 0.76,
      green: 0.56,
      blue: 0.56,
      alpha: 1
    },
    {
      red: 0.4,
      green: 0.56,
      blue: 0.56,
      alpha: 1
    },
    {
      red: 0.74,
      green: 0.5,
      blue: 0.89,
      alpha: 1
    },
    {
      red: 1.0,
      green: 0.63,
      blue: 0.0,
      alpha: 1
    },
    {
      red: 0.65,
      green: 0.16,
      blue: 0.16,
      alpha: 1
    },
    {
      red: 0.36,
      green: 0.72,
      blue: 0.82,
      alpha: 1
    },
    {
      red: 0.44,
      green: 0.18,
      blue: 0.69,
      alpha: 1
    },
    {
      red: 0.0,
      green: 1.0,
      blue: 0.0,
      alpha: 1
    },
    {
      red: 0.58,
      green: 1.0,
      blue: 1.0,
      alpha: 1
    },
    {
      red: 0.58,
      green: 0.88,
      blue: 0.88,
      alpha: 1
    },
    {
      red: 0.45,
      green: 0.76,
      blue: 0.79,
      alpha: 1
    },
    {
      red: 0.33,
      green: 0.71,
      blue: 0.71,
      alpha: 1
    },
    {
      red: 0.23,
      green: 0.62,
      blue: 0.62,
      alpha: 1
    },
    {
      red: 0.14,
      green: 0.56,
      blue: 0.56,
      alpha: 1
    },
    {
      red: 0.04,
      green: 0.49,
      blue: 0.55,
      alpha: 1
    },
    {
      red: 0.0,
      green: 0.41,
      blue: 0.52,
      alpha: 1
    },
    {
      red: 0.88,
      green: 0.88,
      blue: 1.0,
      alpha: 1
    },
    {
      red: 1.0,
      green: 0.85,
      blue: 0.56,
      alpha: 1
    },
    {
      red: 0.65,
      green: 0.46,
      blue: 0.45,
      alpha: 1
    },
    {
      red: 0.4,
      green: 0.5,
      blue: 0.5,
      alpha: 1
    },
    {
      red: 0.62,
      green: 0.39,
      blue: 0.71,
      alpha: 1
    },
    {
      red: 0.83,
      green: 0.48,
      blue: 0.0,
      alpha: 1
    },
    {
      red: 0.58,
      green: 0.0,
      blue: 0.58,
      alpha: 1
    },
    {
      red: 0.26,
      green: 0.62,
      blue: 0.69,
      alpha: 1
    },
    {
      red: 0.34,
      green: 0.09,
      blue: 0.56,
      alpha: 1
    },
    {
      red: 0.0,
      green: 0.79,
      blue: 0.0,
      alpha: 1
    },
    {
      red: 0.44,
      green: 0.83,
      blue: 1.0,
      alpha: 1
    },
    {
      red: 1.0,
      green: 1.0,
      blue: 0.78,
      alpha: 1
    },
    {
      red: 0.85,
      green: 1.0,
      blue: 0.78,
      alpha: 1
    },
    {
      red: 0.78,
      green: 1.0,
      blue: 0.78,
      alpha: 1
    },
    {
      red: 0.64,
      green: 1.0,
      blue: 0.78,
      alpha: 1
    },
    {
      red: 0.56,
      green: 1.0,
      blue: 0.78,
      alpha: 1
    },
    {
      red: 0.38,
      green: 1.0,
      blue: 0.78,
      alpha: 1
    },
    {
      red: 0.27,
      green: 1.0,
      blue: 0.78,
      alpha: 1
    },
    {
      red: 0.19,
      green: 1.0,
      blue: 0.78,
      alpha: 1
    },
    {
      red: 0.12,
      green: 1.0,
      blue: 0.78,
      alpha: 1
    },
    {
      red: 0.0,
      green: 1.0,
      blue: 0.61,
      alpha: 1
    },
    {
      red: 0.0,
      green: 0.9,
      blue: 0.46,
      alpha: 1
    },
    {
      red: 0.0,
      green: 0.83,
      blue: 0.32,
      alpha: 1
    },
    {
      red: 0.0,
      green: 0.75,
      blue: 0.22,
      alpha: 1
    },
    {
      red: 0.0,
      green: 0.67,
      blue: 0.14,
      alpha: 1
    },
    {
      red: 0.3,
      green: 0.76,
      blue: 1.0,
      alpha: 1
    },
    {
      red: 0.3,
      green: 0.65,
      blue: 1.0,
      alpha: 1
    },
    {
      red: 0.13,
      green: 0.58,
      blue: 0.84,
      alpha: 1
    },
    {
      red: 0.15,
      green: 0.49,
      blue: 0.67,
      alpha: 1
    },
    {
      red: 0.15,
      green: 0.4,
      blue: 0.59,
      alpha: 1
    },
    {
      red: 0.09,
      green: 0.33,
      blue: 0.53,
      alpha: 1
    },
    {
      red: 0.96,
      green: 0.93,
      blue: 0.82,
      alpha: 1
    },
    {
      red: 0.8,
      green: 0.82,
      blue: 0.12,
      alpha: 1
    },
    {
      red: 0.71,
      green: 0.71,
      blue: 0.76,
      alpha: 1
    },
    {
      red: 0.65,
      green: 0.33,
      blue: 0.3,
      alpha: 1
    },
    {
      red: 0.34,
      green: 0.35,
      blue: 0.38,
      alpha: 1
    },
    {
      red: 0.62,
      green: 0.31,
      blue: 0.71,
      alpha: 1
    },
    {
      red: 0.67,
      green: 0.36,
      blue: 0.0,
      alpha: 1
    },
    {
      red: 0.46,
      green: 0.31,
      blue: 0.27,
      alpha: 1
    },
    {
      red: 0.26,
      green: 0.51,
      blue: 0.59,
      alpha: 1
    },
    {
      red: 0.26,
      green: 0.0,
      blue: 0.4,
      alpha: 1
    },
    {
      red: 0.0,
      green: 0.49,
      blue: 0.0,
      alpha: 1
    },
    {
      red: 0.44,
      green: 0.67,
      blue: 0.98,
      alpha: 1
    },
    {
      red: 0.0,
      green: 0.73,
      blue: 1.0,
      alpha: 1
    },
    {
      red: 0.0,
      green: 0.63,
      blue: 1.0,
      alpha: 1
    },
    {
      red: 0.0,
      green: 0.56,
      blue: 1.0,
      alpha: 1
    },
    {
      red: 0.0,
      green: 0.5,
      blue: 1.0,
      alpha: 1
    },
    {
      red: 0.0,
      green: 0.42,
      blue: 1.0,
      alpha: 1
    },
    {
      red: 0.33,
      green: 0.36,
      blue: 0.95,
      alpha: 1
    },
    {
      red: 0.47,
      green: 0.36,
      blue: 0.89,
      alpha: 1
    },
    {
      red: 0.54,
      green: 0.31,
      blue: 0.89,
      alpha: 1
    },
    {
      red: 0.63,
      green: 0.21,
      blue: 0.83,
      alpha: 1
    },
    {
      red: 0.7,
      green: 0.12,
      blue: 0.83,
      alpha: 1
    },
    {
      red: 0.7,
      green: 0.12,
      blue: 0.73,
      alpha: 1
    },
    {
      red: 0.7,
      green: 0.05,
      blue: 0.65,
      alpha: 1
    },
    {
      red: 0.74,
      green: 0.05,
      blue: 0.53,
      alpha: 1
    },
    {
      red: 0.78,
      green: 0.0,
      blue: 0.4,
      alpha: 1
    },
    {
      red: 0.8,
      green: 0.0,
      blue: 0.35,
      alpha: 1
    },
    {
      red: 0.82,
      green: 0.0,
      blue: 0.31,
      alpha: 1
    },
    {
      red: 0.85,
      green: 0.0,
      blue: 0.27,
      alpha: 1
    },
    {
      red: 0.88,
      green: 0.0,
      blue: 0.22,
      alpha: 1
    },
    {
      red: 0.9,
      green: 0.0,
      blue: 0.18,
      alpha: 1
    },
    {
      red: 0.92,
      green: 0.0,
      blue: 0.15,
      alpha: 1
    },
    {
      red: 0.93,
      green: 0.0,
      blue: 0.14,
      alpha: 1
    },
    {
      red: 0.94,
      green: 0.0,
      blue: 0.13,
      alpha: 1
    },
    {
      red: 0.95,
      green: 0.0,
      blue: 0.12,
      alpha: 1
    },
    {
      red: 0.96,
      green: 0.0,
      blue: 0.11,
      alpha: 1
    },
    {
      red: 0.97,
      green: 0.0,
      blue: 0.1,
      alpha: 1
    },
    {
      red: 0.98,
      green: 0.0,
      blue: 0.09,
      alpha: 1
    },
    {
      red: 0.99,
      green: 0.0,
      blue: 0.08,
      alpha: 1
    },
    {
      red: 0.99,
      green: 0.0,
      blue: 0.07,
      alpha: 1
    },
    {
      red: 0.99,
      green: 0.0,
      blue: 0.06,
      alpha: 1
    }
  ]
  get(key: string | number): Color {
    if (typeof key === 'number') {
      return this._array[key]
    } else {
      const keyNum = parseInt(key)
      if (isNaN(keyNum) || keyNum < 0 || keyNum >= this._array.length) {
        return this._array[0]
      } else {
        return this._array[keyNum]
      }
    }
  }
}
