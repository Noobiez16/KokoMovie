import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** Preload before the actual application entry, including initial hydration/migration. */
export async function isolatedCredentials(directory: string, credential: string | null) {
  const bootstrap = join(directory, 'credentials.cjs')
  await writeFile(bootstrap, `
const { createRequire } = require('node:module');
const projectRequire = createRequire(${JSON.stringify(resolve('package.json'))});
const keytar = projectRequire('keytar');
keytar.getPassword = async () => ${JSON.stringify(credential)};
keytar.setPassword = async () => {};
keytar.deletePassword = async () => false;
`)
  return ['-r', bootstrap, '.', '--user-data-dir=' + join(directory, 'profile')]
}
