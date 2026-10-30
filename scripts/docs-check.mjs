import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const files = [
  'README.md',
  'AGENTS.md',
  'PLANS.md',
  ...(await readdir('docs', { recursive: true }))
    .filter((file) => file.endsWith('.md'))
    .map((file) => `docs/${file}`)
]
const errors = []
const documents = new Map()
const withoutFences = (source) => source.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
async function document(path) {
  if (documents.has(path)) return documents.get(path)
  const source = withoutFences(await readFile(path, 'utf8'))
  const anchors = new Set()
  for (const match of source.matchAll(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/gm)) {
    const slug = match[1]
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}\p{M}_ -]/gu, '')
      .replace(/ /g, '-')
    let anchor = slug
    let suffix = 0
    while (anchors.has(anchor)) anchor = `${slug}-${++suffix}`
    anchors.add(anchor)
  }
  for (const match of source.matchAll(/<a\s+(?:id|name)=["']([^"']+)["']/g)) anchors.add(match[1])
  const result = { source, anchors }
  documents.set(path, result)
  return result
}
for (const file of files) {
  const { source } = await document(resolve(file))
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1]
    if (/^(https?:|mailto:)/.test(link)) continue
    try {
      const [path, fragment] = link.split('#')
      const destination = path ? resolve(dirname(file), decodeURIComponent(path)) : resolve(file)
      await stat(destination)
      if (fragment && destination.endsWith('.md')) {
        const target = await document(destination)
        if (!target.anchors.has(decodeURIComponent(fragment)))
          throw new Error('Missing Markdown anchor')
      }
    } catch {
      errors.push(`${file}: ${link}`)
    }
  }
}
if (errors.length) throw new Error(`Broken documentation links:\n${errors.join('\n')}`)
console.log(`Checked local links and Markdown anchors in ${files.length} Markdown documents.`)
