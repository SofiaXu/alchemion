import type {
  AdapterFactory,
  Candidate,
  DisplayMode,
  PickResult,
  RenderSnapshot
} from '../contracts'
import { CAMERA, HEIGHT, orbitCamera, prepareFixture, prepareUpdates, WIDTH } from '../fixture'
import { ComparisonViewer, type SelectionObservation } from '../runtime'

type Factories = Partial<Record<Candidate, AdapterFactory>>
export interface ClickTarget {
  x: number
  y: number
  expected: PickResult
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`M2 correctness: ${message}`)
}

function projected(x: number, y: number, z: number) {
  const scale =
    HEIGHT / 2 / Math.tan((CAMERA.fovYDegrees * Math.PI) / 360) / (CAMERA.position[2] - z)
  return {
    x: WIDTH / 2 + (x - CAMERA.target[0]) * scale,
    y: HEIGHT / 2 - (y - CAMERA.target[1]) * scale
  }
}

function clickTargets(snapshot: RenderSnapshot, mode: DisplayMode, count: number): ClickTarget[] {
  const targets: ClickTarget[] = []
  for (let j = 0; j < count; j++) {
    const bond = mode === 'ball-and-stick' && j >= Math.ceil(count / 2)
    const local = bond ? j - Math.ceil(count / 2) : j
    const x = 2 + (local % 20)
    const y = 2 + (Math.floor(local / 20) % 15)
    const atomIndex = 9500 + y * 25 + x
    if (bond) {
      const index = Math.floor(atomIndex / 25) * 24 + x
      const a = snapshot.bondEndpoints[index * 2]
      const b = snapshot.bondEndpoints[index * 2 + 1]
      const point = projected(
        (snapshot.positions[a * 3] + snapshot.positions[b * 3]) / 2,
        (snapshot.positions[a * 3 + 1] + snapshot.positions[b * 3 + 1]) / 2,
        (snapshot.positions[a * 3 + 2] + snapshot.positions[b * 3 + 2]) / 2
      )
      targets.push({
        ...point,
        expected: {
          kind: 'bond',
          index,
          instanceId: snapshot.bondIds[index],
          sourceId: snapshot.sourceBondIds[index]
        }
      })
    } else {
      const point = projected(
        snapshot.positions[atomIndex * 3],
        snapshot.positions[atomIndex * 3 + 1],
        snapshot.positions[atomIndex * 3 + 2]
      )
      targets.push({
        ...point,
        expected: {
          kind: 'atom',
          index: atomIndex,
          instanceId: snapshot.atomIds[atomIndex],
          sourceId: snapshot.sourceAtomIds[atomIndex]
        }
      })
    }
  }
  return targets
}

export async function boot(factories: Factories) {
  const fixture = await prepareFixture()
  const container =
    document.querySelector<HTMLElement>('#comparison') ??
    document.body.appendChild(document.createElement('main'))
  container.id = 'comparison'
  document.body.style.margin = '0'
  container.style.width = `${WIDTH}px`
  container.style.height = `${HEIGHT}px`
  let active: ComparisonViewer | undefined
  const factoryFor = (candidate: Candidate) => {
    const factory = factories[candidate]
    if (!factory) throw new Error(`M2 candidate not included in this consumer: ${candidate}`)
    return factory
  }
  const viewer = () => {
    if (!active) throw new Error('M2 viewer has not been loaded.')
    return active
  }
  function auxiliary(candidate: Candidate, mode: DisplayMode) {
    const element = document.createElement('div')
    element.style.cssText = `position:absolute;left:-10000px;top:0;width:${WIDTH}px;height:${HEIGHT}px`
    document.body.append(element)
    const instance = new ComparisonViewer(factoryFor(candidate), candidate, mode, element)
    return {
      instance,
      element,
      dispose: () => {
        const counts = instance.dispose()
        element.remove()
        return counts
      }
    }
  }

  const api = {
    info: () => fixture.description,
    candidates: () => Object.keys(factories) as Candidate[],
    async load(candidate: Candidate, mode: DisplayMode) {
      active?.dispose()
      active = new ComparisonViewer(factoryFor(candidate), candidate, mode, container)
      const started = performance.now()
      await active.setSnapshot(structuredClone(fixture.snapshot))
      return {
        viewerId: active.id,
        firstFrameMs: performance.now() - started,
        initializationMs: active.initializationMs,
        environment: active.environment(),
        fixture: fixture.description,
        stats: active.adapter.stats()
      }
    },
    interact(warmupMs = 10000, durationMs = 60000) {
      return viewer().motion(warmupMs, durationMs, orbitCamera)
    },
    async targets(count = 200) {
      const current = viewer()
      current.adapter.setCamera(CAMERA)
      current.adapter.render()
      await current.completeFrame()
      return clickTargets(current.snapshot!, current.mode, count)
    },
    selection: (): SelectionObservation => ({ ...viewer().selection }),
    async visibility() {
      const current = viewer()
      current.adapter.setCamera(CAMERA)
      await current.completeFrame()
      current.adapter.render()
      const samples = clickTargets(
        current.snapshot!,
        current.mode,
        current.mode === 'ball-and-stick' ? 8 : 4
      ).map((target) => {
        const rgba = new Uint8Array(4)
        current.gl.readPixels(
          Math.floor(target.x),
          HEIGHT - 1 - Math.floor(target.y),
          1,
          1,
          current.gl.RGBA,
          current.gl.UNSIGNED_BYTE,
          rgba
        )
        const pixel = [...rgba]
        check(
          pixel[3] === 255 && pixel.slice(0, 3).some((channel) => channel > 5 && channel < 245),
          `front ${target.expected.kind} ${target.expected.instanceId} was not visibly shaded`
        )
        return { kind: target.expected.kind, instanceId: target.expected.instanceId, rgba: pixel }
      })
      return { visible: true, samples }
    },
    async workerSmoke() {
      const current = viewer()
      await current.runtime.request(fixture.snapshot, { documentId: 'consumer', revision: 0 })
      const received = current.snapshot!
      check(
        received.positions.every((value, i) => value === fixture.snapshot.positions[i]) &&
          received.colors.every((value, i) => value === fixture.snapshot.colors[i]) &&
          received.bondEndpoints.every((value, i) => value === fixture.snapshot.bondEndpoints[i]),
        'consumer Worker changed snapshot buffers'
      )
      check(
        received.atomIds.every((value, i) => value === fixture.snapshot.atomIds[i]) &&
          received.sourceAtomIds.every((value, i) => value === fixture.snapshot.sourceAtomIds[i]),
        'consumer Worker changed instance/source identity'
      )
      current.adapter.setCamera(CAMERA)
      await current.completeFrame()
      const target = clickTargets(received, current.mode, 1)[0]
      const picked = current.adapter.pick(target.x, target.y)
      check(
        picked?.instanceId === target.expected.instanceId &&
          picked.sourceId === target.expected.sourceId,
        'consumer Worker snapshot is not pickable'
      )
      return {
        correct: true,
        stats: current.adapter.stats(),
        documentId: current.runtime.committedDocumentId,
        revision: current.runtime.committedRevision,
        pick: picked
      }
    },
    async updates(count = 100) {
      const current = viewer()
      current.adapter.setCamera(CAMERA)
      const prepared = prepareUpdates(current.snapshot!, count)
      const times: number[] = []
      const dirtyAtomCounts: number[] = []
      const dirtyBondCounts: number[] = []
      for (const update of prepared) {
        const started = performance.now()
        current.adapter.update(update)
        current.adapter.render()
        await current.completeFrame()
        times.push(performance.now() - started)
        dirtyAtomCounts.push(update.atomIndices.length)
        dirtyBondCounts.push(update.bondIndices.length)
        current.snapshot = update.snapshot
        // Independent ID check at a moved front-layer atom; outside the timed region.
        const index = update.atomIndices[0]
        const point = projected(
          update.snapshot.positions[index * 3],
          update.snapshot.positions[index * 3 + 1],
          update.snapshot.positions[index * 3 + 2]
        )
        const picked = current.adapter.pick(point.x, point.y)
        check(
          picked?.instanceId === update.snapshot.atomIds[index] &&
            picked.sourceId === update.snapshot.sourceAtomIds[index],
          `updated atom ${index} does not map to its source`
        )
      }
      return { times, correct: true, dirtyAtomCounts, dirtyBondCounts }
    },
    async updateProbe() {
      const current = viewer()
      const original = structuredClone(fixture.snapshot)
      await current.setSnapshot(original)
      current.adapter.setCamera(CAMERA)
      const moved = structuredClone(original)
      const index = 9500 + 10 * 25 + 12
      // Move outside the old projected silhouette: interior perspective gaps
      // can contain rear-layer atoms and cannot prove that a GPU upload happened.
      moved.positions[index * 3] += 84
      moved.positions[index * 3 + 1] += 1.5
      moved.positions[index * 3 + 2] += 3
      const dirtyBonds = []
      for (let i = 0; i < moved.bondIds.length; i++) {
        if (moved.bondEndpoints[i * 2] === index || moved.bondEndpoints[i * 2 + 1] === index)
          dirtyBonds.push(i)
      }
      const probeBond = dirtyBonds.find(
        (bond) =>
          moved.bondEndpoints[bond * 2] === index &&
          moved.bondEndpoints[bond * 2 + 1] === index + 25
      )!
      const atomPoint = projected(
        moved.positions[index * 3],
        moved.positions[index * 3 + 1],
        moved.positions[index * 3 + 2]
      )
      const neighbor = index + 25
      const bondPoint = projected(
        (moved.positions[index * 3] + moved.positions[neighbor * 3]) / 2,
        (moved.positions[index * 3 + 1] + moved.positions[neighbor * 3 + 1]) / 2,
        (moved.positions[index * 3 + 2] + moved.positions[neighbor * 3 + 2]) / 2
      )
      const pixel = (point: { x: number; y: number }) => {
        const rgba = new Uint8Array(4)
        current.gl.readPixels(
          Math.floor(point.x),
          HEIGHT - 1 - Math.floor(point.y),
          1,
          1,
          current.gl.RGBA,
          current.gl.UNSIGNED_BYTE,
          rgba
        )
        return [...rgba]
      }
      const isBackground = (rgba: number[]) =>
        rgba[0] === 255 && rgba[1] === 255 && rgba[2] === 255 && rgba[3] === 255
      const isShaded = (rgba: number[]) =>
        rgba[3] === 255 && rgba.slice(0, 3).some((channel) => channel > 5 && channel < 245)
      try {
        await current.completeFrame()
        current.adapter.render()
        const beforeAtom = pixel(atomPoint)
        const beforeBond = current.mode === 'ball-and-stick' ? pixel(bondPoint) : null
        check(isBackground(beforeAtom), 'local-update atom probe target was not initially empty')
        if (beforeBond)
          check(isBackground(beforeBond), 'local-update bond probe target was not initially empty')
        current.adapter.update({
          snapshot: moved,
          atomIndices: new Uint32Array([index]),
          bondIndices: new Uint32Array(dirtyBonds)
        })
        await current.completeFrame()
        current.adapter.render()
        const afterAtom = pixel(atomPoint)
        const afterBond = current.mode === 'ball-and-stick' ? pixel(bondPoint) : null
        check(isShaded(afterAtom), 'local-update atom GPU buffer was not visibly updated')
        if (afterBond)
          check(isShaded(afterBond), 'local-update bond GPU buffer was not visibly updated')
        const atomPick = current.adapter.pick(atomPoint.x, atomPoint.y)
        check(
          atomPick?.instanceId === moved.atomIds[index] &&
            atomPick.sourceId === moved.sourceAtomIds[index],
          'moved atom picking cache is stale'
        )
        const bondPick =
          current.mode === 'ball-and-stick' ? current.adapter.pick(bondPoint.x, bondPoint.y) : null
        if (current.mode === 'ball-and-stick')
          check(
            bondPick?.instanceId === moved.bondIds[probeBond] &&
              bondPick.sourceId === moved.sourceBondIds[probeBond],
            'moved bond picking cache is stale'
          )
        return {
          correct: true,
          beforeAtom,
          afterAtom,
          beforeBond,
          afterBond,
          atomPick,
          bondPick,
          dirtyBondCount: dirtyBonds.length
        }
      } finally {
        await current.setSnapshot(structuredClone(fixture.snapshot))
      }
    },
    async lifecycle(candidate: Candidate, mode: DisplayMode, rounds = 20) {
      active?.dispose()
      active = undefined
      const result = []
      for (let round = 0; round < rounds; round++) {
        const instance = new ComparisonViewer(factoryFor(candidate), candidate, mode, container)
        const started = performance.now()
        await instance.setSnapshot(structuredClone(fixture.snapshot))
        const before = instance.ledger.snapshot()
        const after = instance.dispose()
        const repeated = instance.dispose()
        check(
          JSON.stringify(after) === JSON.stringify(repeated),
          'repeated dispose changes resource accounting'
        )
        result.push({
          round: round + 1,
          elapsedMs: performance.now() - started,
          before,
          after,
          heap:
            (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
              ?.usedJSHeapSize ?? null
        })
      }
      return result
    },
    dispose() {
      const counts = active?.dispose() ?? null
      active = undefined
      return counts
    },
    async correctness(candidate: Candidate, mode: DisplayMode) {
      active?.dispose()
      active = undefined
      const first = auxiliary(candidate, mode)
      const second = auxiliary(candidate, mode)
      const a = first.instance
      const b = second.instance
      const aborted = (operation: Promise<void>) =>
        operation.then(
          () => 'fulfilled',
          (error: Error) => error.name
        )
      const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))
      try {
        await a.setSnapshot(structuredClone(fixture.snapshot))
        const expected = a.adapter.stats()
        const input = structuredClone(fixture.snapshot)
        const transferred = a.runtime.request(input, { documentId: 'A', revision: 0 })
        input.positions[0] = 99999
        await transferred
        check(
          a.snapshot?.positions[0] === fixture.snapshot.positions[0],
          'Worker input must be isolated'
        )
        check(
          JSON.stringify(a.adapter.stats()) === JSON.stringify(expected),
          'Worker and direct snapshot differ'
        )
        check(
          a.snapshot?.positions.length === 30000 && a.snapshot.bondEndpoints.length === 40000,
          'Worker transfer has incorrect buffers'
        )
        const oldRevision = aborted(
          a.runtime.request(fixture.snapshot, {
            documentId: 'A',
            revision: 1,
            delayMs: 60,
            ignoreCancel: true
          })
        )
        await a.runtime.request(fixture.snapshot, { documentId: 'A', revision: 2 })
        check(
          (await oldRevision) === 'AbortError',
          'superseded revision did not end with AbortError'
        )
        await pause(90)
        check(a.runtime.committedRevision === 2, 'old revision replaced the current frame')
        const oldDocument = aborted(
          a.runtime.request(fixture.snapshot, {
            documentId: 'A',
            revision: 0,
            delayMs: 60,
            ignoreCancel: true
          })
        )
        await a.runtime.request(fixture.snapshot, { documentId: 'B', revision: 0 })
        check(
          (await oldDocument) === 'AbortError',
          'superseded document did not end with AbortError'
        )
        await pause(90)
        check(
          a.runtime.committedDocumentId === 'B' && Number(a.runtime.committedRevision) === 0,
          'previous document replaced a new document with the same revision'
        )
        const cleared = aborted(
          a.runtime.request(fixture.snapshot, {
            documentId: 'B',
            revision: 1,
            delayMs: 60,
            ignoreCancel: true
          })
        )
        a.clear()
        check((await cleared) === 'AbortError', 'clear left a pending request')
        await pause(90)
        check(
          a.adapter.stats().atoms === 0 && a.adapter.stats().bonds === 0,
          'late result rebuilt cleared resources'
        )
        const failure = await aborted(
          a.runtime.request(fixture.snapshot, { documentId: 'C', revision: 0, fail: true })
        )
        check(failure === 'Error', 'Worker error did not reject its Promise')
        const timeout = await aborted(
          a.runtime.request(fixture.snapshot, {
            documentId: 'C',
            revision: 1,
            delayMs: 60,
            timeoutMs: 10,
            ignoreCancel: true
          })
        )
        check(timeout === 'Error', 'Worker timeout did not reject its Promise')
        await pause(90)
        check(a.adapter.stats().atoms === 0, 'timed-out Worker result was committed')
        await b.setSnapshot(structuredClone(fixture.snapshot))
        const bStats = b.adapter.stats()
        const point = clickTargets(fixture.snapshot, mode, 1)[0]
        check(
          b.adapter.pick(point.x, point.y)?.instanceId === point.expected.instanceId,
          'second viewer cannot pick its own instance'
        )
        const disposing = aborted(
          a.runtime.request(fixture.snapshot, {
            documentId: 'D',
            revision: 0,
            delayMs: 60,
            ignoreCancel: true
          })
        )
        const releasedA = first.dispose()
        check((await disposing) === 'AbortError', 'dispose left a pending request')
        await pause(90)
        check(
          JSON.stringify(b.adapter.stats()) === JSON.stringify(bStats),
          'disposing first viewer changed second viewer resources'
        )
        check(
          b.adapter.pick(point.x, point.y)?.instanceId === point.expected.instanceId,
          'disposing first viewer broke second viewer picking'
        )
        const staleReplies = a.runtime.staleReplies
        check(staleReplies >= 4, 'the controlled Worker did not exercise stale response handling')
        const releasedB = second.dispose()
        return {
          correct: true,
          workerEqualsDirect: true,
          inputIsolation: true,
          staleReplies,
          cancellation: 'AbortError',
          workerError: failure,
          timeout,
          multipleViewers: true,
          releasedA,
          releasedB
        }
      } finally {
        first.dispose()
        second.dispose()
      }
    }
  }
  window.m2 = api
  return api
}

export type ComparisonApi = Awaited<ReturnType<typeof boot>>
declare global {
  interface Window {
    m2: ComparisonApi
    __m2Selection?: (selection: SelectionObservation) => Promise<void> | void
  }
}
