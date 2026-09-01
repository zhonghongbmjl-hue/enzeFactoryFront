import { spawn } from 'node:child_process'
import {
  acquireRunLock,
  atomicWriteState,
  createRunToken,
  cleanupPlan,
  composeProjectName,
  inspectProcess,
  processResourceRecord,
  projectIdentity,
  stateVersion,
} from '../e2e-launcher.mjs'

const [projectDirectory, stage] = process.argv.slice(2)
const runToken = createRunToken()
const observedStartedAt = (pid) => {
  const observed = inspectProcess(pid)?.startedAt
  return Number.isFinite(observed) ? observed : Date.now()
}
const launcherStartedAt = observedStartedAt(process.pid)
acquireRunLock(projectDirectory, runToken, {
  pid: process.pid,
  startedAt: launcherStartedAt,
})

const marker = `garment.e2e.run-token=${runToken}`
const childArguments = ['-e', 'setInterval(() => {}, 1000)', marker]
if (stage === 'backend') childArguments.push('garment-saas-backend')
const child = spawn(process.execPath, childArguments, {
  detached: true,
  stdio: 'ignore',
})
child.unref()
const childStartedAt = observedStartedAt(child.pid)
const childResource = processResourceRecord(child.pid, stage, marker)

atomicWriteState(projectDirectory, runToken, {
  version: stateVersion,
  projectIdentity: projectIdentity(projectDirectory),
  runToken,
  launcherPid: process.pid,
  launcherStartedAt: new Date(launcherStartedAt).toISOString(),
  backendPid: stage === 'backend' ? child.pid : null,
  backendStartedAt: stage === 'backend' ? new Date(childStartedAt).toISOString() : null,
  backendResource: stage === 'backend' ? childResource : null,
  activeChild: stage !== 'backend' ? childResource : null,
  composeCleanup: cleanupPlan(composeProjectName(runToken)),
  dependencyPorts:
    stage === 'backend' ? { mysql: 49101, redis: 49102, minio: 49103, minioConsole: 49104 } : null,
})

process.stdout.write(`${JSON.stringify({ runToken, childPid: child.pid })}\n`)
setInterval(() => {}, 1000)
