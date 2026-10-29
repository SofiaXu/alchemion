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
for (const file of files) {
  const text = await readFile(file, 'utf8')
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1].split('#')[0]
    if (!link || /^(https?:|mailto:)/.test(link)) continue
    const destination = resolve(dirname(file), decodeURIComponent(link))
    try {
      await stat(destination)
    } catch {
      errors.push(`${file}: ${link}`)
    }
  }
}
if (errors.length) throw new Error(`Broken documentation links:\n${errors.join('\n')}`)
console.log(`Checked local links in ${files.length} Markdown documents.`)
