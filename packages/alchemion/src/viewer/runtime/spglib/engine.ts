import { transpose } from '../../../core/math'
import type { Matrix3, Vec3 } from '../../../core/types'
import wasmUrl from './spglib.wasm?url&no-inline'

interface SpglibExports {
  readonly memory: WebAssembly.Memory
  _initialize(): void
  malloc(size: number): number
  free(address: number): void
  modeling_find(
    lattice: number,
    positions: number,
    types: number,
    count: number,
    hall: number,
    distance: number,
    angle: number
  ): number
  modeling_header(dataset: number, address: number): void
  modeling_operation(dataset: number, index: number, address: number): void
  modeling_orbit(dataset: number, index: number): number
  modeling_primitive_site(dataset: number, index: number): number
  spg_get_error_code(): number
  spg_free_dataset(dataset: number): void
}

export interface SpglibDataset {
  readonly itNumber: number
  readonly hallNumber: number
  readonly transformation: Matrix3
  readonly originShift: Vec3
  readonly primitiveBasis: Matrix3
  readonly equivalentSites: readonly number[]
  readonly primitiveSites: readonly number[]
  readonly operations: readonly { readonly rotation: Matrix3; readonly translation: Vec3 }[]
}

let loading: Promise<SpglibExports> | undefined

async function loadSpglib(): Promise<SpglibExports> {
  const response = await fetch(wasmUrl)
  if (!response.ok) throw new Error(`The spglib module returned HTTP ${response.status}.`)
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {
    env: { emscripten_notify_memory_growth: () => {} },
    wasi_snapshot_preview1: {
      environ_sizes_get: (count: number, size: number) => {
        const view = new DataView(exports.memory.buffer)
        view.setUint32(count, 0, true)
        view.setUint32(size, 0, true)
        return 0
      },
      environ_get: () => 0
    }
  })
  const exports = instance.exports as unknown as SpglibExports
  exports._initialize()
  return exports
}

const tuple = (values: Float64Array, index: number): Vec3 => [
  values[index],
  values[index + 1],
  values[index + 2]
]
const matrix = (values: Float64Array, index: number): Matrix3 =>
  transpose([tuple(values, index), tuple(values, index + 3), tuple(values, index + 6)])

export async function findCrystalDataset(
  basis: Matrix3,
  positions: readonly Vec3[],
  species: readonly number[],
  hall: number,
  distance: number,
  angle: number
): Promise<SpglibDataset | number> {
  const engine = await (loading ??= loadSpglib().catch((error: unknown) => {
    loading = undefined
    throw error
  }))
  const count = positions.length
  const buffer = engine.malloc(25 * 8 + count * (3 * 8 + 4))
  if (!buffer) throw new Error('spglib could not allocate its input buffer.')
  const coordinateAddress = buffer + 25 * 8
  const typeAddress = coordinateAddress + count * 3 * 8
  let dataset = 0
  try {
    new Float64Array(engine.memory.buffer, buffer, 9).set(transpose(basis).flat())
    new Float64Array(engine.memory.buffer, coordinateAddress, count * 3).set(positions.flat())
    new Int32Array(engine.memory.buffer, typeAddress, count).set(species)
    dataset = engine.modeling_find(
      buffer,
      coordinateAddress,
      typeAddress,
      count,
      hall,
      distance,
      angle
    )
    if (!dataset) return engine.spg_get_error_code()
    engine.modeling_header(dataset, buffer)
    const data = new Float64Array(engine.memory.buffer, buffer, 25)
    const itNumber = data[0]
    const hallNumber = data[1]
    const operationCount = data[2]
    const transformation = matrix(data, 4)
    const originShift = tuple(data, 13)
    const primitiveBasis = matrix(data, 16)
    if (
      !Number.isSafeInteger(operationCount) ||
      operationCount < 1 ||
      operationCount > Math.min(8192, 48 * count)
    )
      throw new Error('spglib returned an invalid operation count.')
    const operations = Array.from({ length: operationCount }, (_, index) => {
      engine.modeling_operation(dataset, index, buffer)
      return { rotation: matrix(data, 0), translation: tuple(data, 9) }
    })
    const equivalentSites = positions.map((_, index) => engine.modeling_orbit(dataset, index))
    const primitiveSites = positions.map((_, index) =>
      engine.modeling_primitive_site(dataset, index)
    )
    return {
      itNumber,
      hallNumber,
      transformation,
      originShift,
      primitiveBasis,
      operations,
      equivalentSites,
      primitiveSites
    }
  } finally {
    if (dataset) engine.spg_free_dataset(dataset)
    engine.free(buffer)
  }
}
