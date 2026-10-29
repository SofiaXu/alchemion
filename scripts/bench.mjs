import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'

export async function measure(url) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(url)
    await page.waitForFunction(() => !!window.m1)
    const load = await page.evaluate(() => window.m1.run('bench'))
    const sample = await page.evaluate(async () => {
      const canvas = document.querySelector('canvas')
      const gl = canvas.getContext('webgl2')
      const debug = gl.getExtension('WEBGL_debug_renderer_info')
      const times = []
      let last = performance.now()
      await new Promise((done) => {
        function frame(now) {
          times.push(now - last)
          last = now
          if (times.length < 120) requestAnimationFrame(frame)
          else done()
        }
        requestAnimationFrame(frame)
      })
      return {
        times,
        webgl2: true,
        renderer: debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER)
      }
    })
    const sorted = [...sample.times].sort((a, b) => a - b)
    const result = {
      purpose: 'M1 harness smoke only; no T-PERF-01 acceptance claim',
      node: process.version,
      browser: browser.version(),
      os: `${os.platform()} ${os.release()}`,
      cpu: os.cpus()[0]?.model,
      memory: os.totalmem(),
      atoms: 128,
      bonds: 0,
      load,
      ...sample,
      frameP95Ms: sorted[Math.floor(sorted.length * 0.95)]
    }
    await page.evaluate(() => window.m1.dispose())
    await mkdir('.tmp/bench', { recursive: true })
    await writeFile('.tmp/bench/m1-smoke.json', JSON.stringify(result, null, 2) + '\n')
    console.log(
      JSON.stringify(
        { ...result, times: `${sample.times.length} samples in .tmp/bench/m1-smoke.json` },
        null,
        2
      )
    )
  } finally {
    await browser.close()
  }
}
