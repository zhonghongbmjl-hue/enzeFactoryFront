import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import {
  acquireOrRecoverRunLock,
  atomicWriteState,
  cleanupCompose,
  cleanupRunByToken,
  createRunToken,
  cleanupPlan,
  composeProjectName,
  inspectProcess,
  processResourceRecord,
  projectIdentity,
  stateVersion,
  terminateTree,
} from '../e2e-launcher.mjs'

const [projectDirectory, start, release, held, cleanupLog, ready] = process.argv.slice(2)
const runToken = createRunToken()
const launcherStartedAtMs = inspectProcess(process.pid)?.startedAt ?? Date.now()
const launcherStartedAt = new Date(launcherStartedAtMs).toISOString()
const marker = `garment.e2e.run-token=${runToken}`
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', marker], {
  detached: process.platform !== 'win32',
})

try {
  await acquireOrRecoverRunLock(projectDirectory, runToken, {
    owner: { pid: process.pid, startedAt: launcherStartedAtMs },
  })
  atomicWriteState(projectDirectory, runToken, {
    version: stateVersion,
    projectIdentity: projectIdentity(projectDirectory),
    runToken,
    launcherPid: process.pid,
    launcherStartedAt,
    backendPid: null,
    backendStartedAt: null,
    backendResource: null,
    activeChild: processResourceRecord(child.pid, 'build', marker),
    composeCleanup: cleanupPlan(composeProjectName(runToken)),
    dependencyPorts: null,
  })
  writeFileSync(ready, JSON.stringify({ runToken, childPid: child.pid }))
  while (!existsSync(start)) await delay(20)
  const cleaned = await cleanupRunByToken(projectDirectory, runToken, async (state) => {
    appendFileSync(cleanupLog, 'normal\n')
    writeFileSync(held, 'held')
    while (!existsSync(release)) await delay(20)
    await terminateTree(child)
    await cleanupCompose(projectDirectory, state.composeCleanup)
  })
  process.stdout.write(JSON.stringify({ ok: true, cleaned }))
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error.message }))
} finally {
  if (child.exitCode === null) await terminateTree(child)
}
