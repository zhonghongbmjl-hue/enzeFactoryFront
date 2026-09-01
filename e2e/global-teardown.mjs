import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import {
  ownsRunLock,
  readOwnedState,
  recoverRunByToken,
  requestShutdown,
} from './support/e2e-launcher.mjs'

export default async function globalTeardown() {
  const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const owned = readOwnedState(projectDirectory, { allowDeadLauncher: true })
  if (!owned) return

  requestShutdown(projectDirectory, owned.runToken)
  const deadline = Date.now() + 5000
  while (Date.now() < deadline && ownsRunLock(projectDirectory, owned.runToken)) {
    await delay(50)
  }
  if (!ownsRunLock(projectDirectory, owned.runToken)) return

  // Destructive fallback takes the shared recovery lease and re-reads lock/state under it.
  await recoverRunByToken(projectDirectory, owned.runToken)
}
