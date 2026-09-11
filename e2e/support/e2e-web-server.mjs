import { dirname, join } from 'node:path'
import { clearInterval, setInterval } from 'node:timers'
import { fileURLToPath } from 'node:url'
import {
  acquireOrRecoverRunLock,
  atomicWriteState,
  cleanupRunByToken,
  cleanupCompose,
  cleanupPlan,
  composeArgs,
  composeProjectName,
  createRunToken,
  dependencyComposeEnvironment,
  dependencyServices,
  inspectProcess,
  projectRoot,
  projectIdentity,
  processResourceRecord,
  probeDependencyPorts,
  readDependencyPorts,
  resolveToolchain,
  run,
  runChecked,
  shutdownRequested,
  stateVersion,
  terminateTree,
} from './e2e-launcher.mjs'

const projectDirectory = projectRoot(import.meta.url)
const supportDirectory = dirname(fileURLToPath(import.meta.url))
const toolchain = resolveToolchain(projectDirectory)

if (process.argv.includes('--dry-run')) {
  process.stdout.write(
    JSON.stringify({ projectDirectory, ...toolchain, wrapper: toolchain.mavenCommand }, null, 2),
  )
  process.exit(0)
}

const runToken = createRunToken()
const composeProject = composeProjectName(runToken)
const composeCleanup = cleanupPlan(composeProject)
function observedStartedAt(pid) {
  const observed = inspectProcess(pid)?.startedAt
  return Number.isFinite(observed) ? observed : Date.now()
}

const launcherStartedAtMs = observedStartedAt(process.pid)
const launcherStartedAt = new Date(launcherStartedAtMs).toISOString()
let activeChild
let activeChildState = null
let backendPid = null
let backendStartedAt = null
let backendResource = null
let dependencyPorts = null
let shutdownPromise

function saveState() {
  atomicWriteState(projectDirectory, runToken, {
    version: stateVersion,
    projectIdentity: projectIdentity(projectDirectory),
    runToken,
    launcherPid: process.pid,
    launcherStartedAt,
    backendPid,
    backendStartedAt,
    backendResource,
    activeChild: activeChildState,
    composeCleanup,
    dependencyPorts,
  })
}
function recordActiveChild(child, stage, marker) {
  activeChild = child
  activeChildState = processResourceRecord(child.pid, stage, marker)
  saveState()
}
function clearActiveChild() {
  activeChild = undefined
  activeChildState = null
  saveState()
}

await acquireOrRecoverRunLock(projectDirectory, runToken, {
  owner: { pid: process.pid, startedAt: launcherStartedAtMs },
})
saveState()

async function performShutdown(code) {
  clearInterval(shutdownWatcher)
  try {
    await cleanupRunByToken(projectDirectory, runToken, async (state) => {
      await terminateTree(activeChild)
      await cleanupCompose(projectDirectory, state.composeCleanup)
    })
  } catch (error) {
    process.stderr.write(`E2E Compose 清理失败：${error.message}\n`)
    code ||= 1
  }
  process.exit(code)
}

function shutdown(code = 0) {
  shutdownPromise ||= performShutdown(code)
  return shutdownPromise
}

const shutdownWatcher = setInterval(() => {
  if (shutdownRequested(projectDirectory, runToken)) void shutdown()
}, 50)
shutdownWatcher.unref()

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => void shutdown(signal === 'SIGINT' ? 130 : 143))
}
process.once('uncaughtException', (error) => {
  process.stderr.write(`${error.stack || error}\n`)
  void shutdown(1)
})
process.once('unhandledRejection', (error) => {
  process.stderr.write(`${error?.stack || error}\n`)
  void shutdown(1)
})
process.once('exit', () => {
  if (!activeChild || activeChild.exitCode !== null) return
  if (process.platform === 'win32') activeChild.kill()
  else {
    try {
      process.kill(-activeChild.pid, 'SIGTERM')
    } catch {
      /* already exited */
    }
  }
})

try {
  const composeMarker = `garment.e2e.run-token=${runToken}`
  const composeEnvironment = dependencyComposeEnvironment()
  const commandWrapper = join(supportDirectory, 'e2e-command-wrapper.mjs')
  await runChecked(
    process.execPath,
    [
      commandWrapper,
      composeMarker,
      'docker',
      ...composeArgs(composeProject, 'up', '-d', '--wait', ...dependencyServices),
    ],
    {
      cwd: projectDirectory,
      env: { ...process.env, ...composeEnvironment },
      onSpawn: (child) => recordActiveChild(child, 'compose', composeMarker),
    },
  )
  clearActiveChild()
  dependencyPorts = readDependencyPorts(projectDirectory, composeProject, composeEnvironment)
  await probeDependencyPorts(dependencyPorts)
  saveState()
  const backendEnvironment = {
    ...process.env,
    SPRING_PROFILES_ACTIVE: composeEnvironment.SPRING_PROFILES_ACTIVE,
    BACKEND_CORS_ALLOWED_ORIGINS:
      process.env.BACKEND_CORS_ALLOWED_ORIGINS || 'http://127.0.0.1:4173',
    DB_USERNAME: composeEnvironment.MYSQL_USER,
    DB_PASSWORD: composeEnvironment.MYSQL_PASSWORD,
    SPRING_DATASOURCE_URL: `jdbc:mysql://127.0.0.1:${dependencyPorts.mysql}/garment_saas?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&useSSL=false`,
    SPRING_DATASOURCE_USERNAME: composeEnvironment.MYSQL_USER,
    SPRING_DATASOURCE_PASSWORD: composeEnvironment.MYSQL_PASSWORD,
    REDIS_PASSWORD: composeEnvironment.REDIS_PASSWORD,
    SPRING_DATA_REDIS_HOST: '127.0.0.1',
    SPRING_DATA_REDIS_PORT: String(dependencyPorts.redis),
    SPRING_DATA_REDIS_PASSWORD: composeEnvironment.REDIS_PASSWORD,
    MINIO_ACCESS_KEY: composeEnvironment.MINIO_APP_ACCESS_KEY,
    MINIO_SECRET_KEY: composeEnvironment.MINIO_APP_SECRET_KEY,
    APP_STORAGE_ENDPOINT: `http://127.0.0.1:${dependencyPorts.minio}`,
    APP_STORAGE_ACCESS_KEY: composeEnvironment.MINIO_APP_ACCESS_KEY,
    APP_STORAGE_SECRET_KEY: composeEnvironment.MINIO_APP_SECRET_KEY,
    JWT_SECRET: composeEnvironment.JWT_SECRET,
    LOCAL_DEMO_PASSWORD: composeEnvironment.LOCAL_DEMO_PASSWORD,
  }
  if (toolchain.javaHome) backendEnvironment.JAVA_HOME = toolchain.javaHome
  else delete backendEnvironment.JAVA_HOME
  const buildMarker = `garment.e2e.run-token=${runToken}`
  await runChecked(
    process.execPath,
    [
      commandWrapper,
      buildMarker,
      toolchain.mavenCommand,
      `-Dgarment.e2e.run-token=${runToken}`,
      '-DskipTests',
      'package',
    ],
    {
      cwd: toolchain.backendDirectory,
      env: backendEnvironment,
      onSpawn: (child) => recordActiveChild(child, 'build', buildMarker),
    },
  )
  clearActiveChild()
  const jar = join(toolchain.backendDirectory, 'target', 'garment-saas-backend-0.1.0-SNAPSHOT.jar')
  activeChild = run(toolchain.javaCommand, [`-Dgarment.e2e.run-token=${runToken}`, '-jar', jar], {
    cwd: toolchain.backendDirectory,
    env: backendEnvironment,
    detached: process.platform !== 'win32',
  })
  backendPid = activeChild.pid
  backendResource = processResourceRecord(
    activeChild.pid,
    'backend',
    `garment.e2e.run-token=${runToken}`,
  )
  backendStartedAt = backendResource.startedAt
  activeChildState = null
  saveState()
  activeChild.once('error', (error) => {
    throw error
  })
  activeChild.once('exit', (code) => void shutdown(code ?? 1))
} catch (error) {
  process.stderr.write(`E2E 后端启动失败：${error.stack || error}\n`)
  await shutdown(1)
}
