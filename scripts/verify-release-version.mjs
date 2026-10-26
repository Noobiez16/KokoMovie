import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function verifyReleaseVersion(root, tag) {
  const read = file => JSON.parse(readFileSync(resolve(root, file), 'utf8'))
  const version = read('package.json').version
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid application release version')
  const lock = read('package-lock.json')
  for (const value of [read('client/package.json').version, lock.version, lock.packages[''].version, lock.packages.client.version]) {
    if (value !== version) throw new Error('Root, client, and lockfile release versions must match')
  }
  if (tag && tag !== `v${version}`) throw new Error(`Release tag ${tag} does not match v${version}`)
  const changelog = readFileSync(resolve(root, 'docs/changelog.md'), 'utf8')
  if (!changelog.includes(`## [${version}]`)) throw new Error(`Missing changelog entry for ${version}`)
  return version
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Verified release v${verifyReleaseVersion(process.cwd(), process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined)}`)
}
