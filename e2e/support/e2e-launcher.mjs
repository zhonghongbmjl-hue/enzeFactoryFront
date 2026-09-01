import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  realpathSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHash, randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { createConnection, createServer } from 'node:net'

export const dependencyServices = ['mysql', 'redis', 'minio', 'minio-init']
export const stateVersion = 5
const timestampToleranceMs = 2_000
const recoveryLeaseWaitMs = 10_000
const recoveryLeaseFirstPort = 38_000
const recoveryLeasePortCount = 2_000

export function wrapperName(platform = process.platform) {
  return platform === 'win32' ? 'mvnw.cmd' : 'mvnw'
}

export function composeProjectName(runToken) {
  if (!/^[a-f0-9]{64}$/.test(runToken)) throw new Error('E2E Compose project token 无效。')
  return `garment-e2e-${runToken.slice(0, 20)}`
}

export function cleanupPlan(projectName) {
  validateComposeProjectName(projectName)
  return { projectName, mode: 'down', services: dependencyServices, removeVolumes: true }
}

function executableName(name, platform = process.platform) {
  return platform === 'win32' ? `${name}.exe` : name
}

function commandExists(command, platform = process.platform) {
  const probe = platform === 'win32' ? 'where.exe' : 'which'
  return spawnSync(probe, [command], { stdio: 'ignore' }).status === 0
}

function privateJavaHome(projectDirectory, platform = process.platform) {
  const runtime = join(projectDirectory, '.runtime')
  if (!existsSync(runtime)) return undefined
  for (const parent of readdirSync(runtime, { withFileTypes: true })) {
    if (!parent.isDirectory() || !parent.name.startsWith('jdk-')) continue
    const parentPath = join(runtime, parent.name)
    const direct = join(parentPath, 'bin', executableName('java', platform))
    if (existsSync(direct)) return parentPath
    for (const child of readdirSync(parentPath, { withFileTypes: true })) {
      if (!child.isDirectory()) continue
      const candidate = join(parentPath, child.name)
      if (existsSync(join(candidate, 'bin', executableName('java', platform)))) return candidate
    }
  }
  return undefined
}

export function parseJavaProbe(output, status = 0) {
  const version = output.match(/version "(?:1\.)?(\d+)/)
  const home = output.match(/^\s*java\.home\s*=\s*(.+)\s*$/m)
  return {
    major: status === 0 && version ? Number(version[1]) : 0,
    home: status === 0 && home ? home[1].trim() : undefined,
  }
}

function probeJava(command) {
  const checked = spawnSync(command, ['-XshowSettings:properties', '-version'], {
    encoding: 'utf8',
  })
  return parseJavaProbe(`${checked.stdout || ''}\n${checked.stderr || ''}`, checked.status)
}

export function resolveToolchain(
  projectDirectory,
  platform = process.platform,
  env = process.env,
  dependencies = {},
) {
  const fileExists = dependencies.exists || existsSync
  const commandAvailable = dependencies.commandAvailable || commandExists
  const inspectJava = dependencies.probeJava || probeJava
  const backendDirectory = join(projectDirectory, 'backend')
  const javaExecutable = executableName('java', platform)
  const configuredHome = env.JAVA_HOME
  const configuredJava = configuredHome && join(configuredHome, 'bin', javaExecutable)
  let javaHome
  let javaCommand
  const configured =
    configuredJava && fileExists(configuredJava) ? inspectJava(configuredJava) : { major: 0 }
  if (configured.major >= 25) {
    javaHome = configured.home || configuredHome
    javaCommand = configuredJava
  } else if (commandAvailable('java', platform)) {
    const pathJava = inspectJava('java')
    if (pathJava.major >= 25) {
      javaHome = pathJava.home
      javaCommand = 'java'
    }
  }
  if (!javaCommand) {
    javaHome = privateJavaHome(projectDirectory, platform)
    javaCommand = javaHome && join(javaHome, 'bin', javaExecutable)
  }
  if (!javaCommand) throw new Error('需要 Java 25；JAVA_HOME、PATH 和可选 .runtime 均未找到。')

  const wrapper = join(backendDirectory, wrapperName(platform))
  let mavenCommand
  if (fileExists(wrapper)) mavenCommand = wrapper
  else if (commandAvailable(platform === 'win32' ? 'mvn.cmd' : 'mvn', platform)) {
    mavenCommand = platform === 'win32' ? 'mvn.cmd' : 'mvn'
  } else {
    const runtime = join(projectDirectory, '.runtime')
    const mavenRoot = fileExists(runtime)
      ? readdirSync(runtime, { withFileTypes: true }).find(
          (entry) => entry.isDirectory() && entry.name.startsWith('apache-maven-'),
        )
      : undefined
    mavenCommand =
      mavenRoot && join(runtime, mavenRoot.name, 'bin', platform === 'win32' ? 'mvn.cmd' : 'mvn')
  }
  if (!mavenCommand || (!commandAvailable(mavenCommand, platform) && !fileExists(mavenCommand))) {
    throw new Error('未找到 Maven Wrapper、系统 Maven 或可选 .runtime Maven。')
  }
  return { backendDirectory, javaHome, javaCommand, mavenCommand }
}

export function run(command, args, options = {}) {
  const { onSpawn, ...spawnOptions } = options
  const invocation = commandInvocation(command, args)
  const child = spawn(invocation.command, invocation.args, {
    stdio: 'inherit',
    shell: invocation.shell,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    detached: process.platform !== 'win32',
    ...spawnOptions,
  })
  onSpawn?.(child)
  return child
}

export function commandInvocation(
  command,
  args,
  platform = process.platform,
  commandShell = process.env.ComSpec || 'cmd.exe',
) {
  if (platform !== 'win32') return { command, args, shell: false }
  if (!/\.(?:cmd|bat)$/i.test(command)) return { command, args, shell: false }
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`
  const commandLine = [quote(command), ...args.map(quote)].join(' ')
  return {
    command: commandShell,
    args: ['/d', '/s', '/c', `"${commandLine}"`],
    shell: false,
    windowsVerbatimArguments: true,
  }
}

export function runChecked(command, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = run(command, args, options)
    child.once('error', reject)
    child.once('exit', (code, signal) =>
      code === 0
        ? accept()
        : reject(new Error(`${command} 失败（code=${code}, signal=${signal}）`)),
    )
  })
}

export function runningComposeServices(
  projectDirectory,
  projectName,
  environment = dependencyComposeEnvironment(),
) {
  validateComposeProjectName(projectName)
  const found = spawnSync('docker', composeArgs(projectName, 'ps', '--all', '--services'), {
    cwd: projectDirectory,
    env: { ...process.env, ...environment },
    encoding: 'utf8',
  })
  if (found.status !== 0) return []
  return found.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export async function cleanupCompose(
  projectDirectory,
  plan,
  environment = dependencyComposeEnvironment(),
) {
  if (!validCleanupPlan(plan)) throw new Error('拒绝执行不受信任的 Compose 清理计划。')
  await runChecked(
    'docker',
    composeArgs(plan.projectName, 'down', '--volumes', '--remove-orphans'),
    { cwd: projectDirectory, env: { ...process.env, ...environment } },
  )
}

export function composeArgs(projectName, ...args) {
  validateComposeProjectName(projectName)
  return ['compose', '--project-name', projectName, ...args]
}

export function dependencyComposeEnvironment() {
  return {
    MYSQL_PORT: '0',
    REDIS_PORT: '0',
    MINIO_API_PORT: '0',
    MINIO_CONSOLE_PORT: '0',
    MYSQL_DATABASE: 'garment_saas',
    MYSQL_USER: 'garment_app',
    MYSQL_ROOT_PASSWORD: 'e2e-mysql-root-8Fv2-Qx7-Lp4',
    MYSQL_PASSWORD: 'e2e-mysql-app-4Nz9-Lm3-Rt6',
    REDIS_PASSWORD: 'e2e-redis-6Kp8-Vr2-Hs5',
    MINIO_ROOT_PASSWORD: 'e2e-minio-root-7Tx4-Qa9-Wm2',
    MINIO_APP_ACCESS_KEY: 'garment_backend_app',
    MINIO_APP_SECRET_KEY: 'e2e-minio-app-5Hw9-Sd6-Pk3',
    JWT_SECRET: 'e2e-jwt-signing-secret-2026-08-28-7Vr4-Pm9-Kx2-Hs6-Qn8-Wc5',
    LOCAL_DEMO_PASSWORD: 'DemoOnly!123',
    SPRING_PROFILES_ACTIVE: 'local,e2e',
  }
}

export function parseDependencyPorts(addresses) {
  const names = ['mysql', 'redis', 'minio', 'minioConsole']
  if (
    !addresses ||
    typeof addresses !== 'object' ||
    Object.keys(addresses).sort().join('|') !== [...names].sort().join('|')
  ) {
    throw new Error('E2E 依赖端口集合不完整。')
  }
  const ports = Object.fromEntries(
    names.map((name) => {
      const match = /^127\.0\.0\.1:(\d+)$/.exec(String(addresses[name]).trim())
      const port = match && Number(match[1])
      if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
        throw new Error(`E2E ${name} 依赖端口无效。`)
      }
      return [name, port]
    }),
  )
  if (new Set(Object.values(ports)).size !== names.length) {
    throw new Error('E2E 依赖端口必须互不相同。')
  }
  return ports
}

export function readDependencyPorts(projectDirectory, projectName, environment) {
  validateComposeProjectName(projectName)
  const address = (service, containerPort) => {
    const found = spawnSync(
      'docker',
      composeArgs(projectName, 'port', service, String(containerPort)),
      { cwd: projectDirectory, env: { ...process.env, ...environment }, encoding: 'utf8' },
    )
    if (found.status !== 0 || !found.stdout.trim()) {
      throw new Error(
        `无法读取 E2E ${service}:${containerPort} 实际宿主端口：${found.stderr || found.stdout}`,
      )
    }
    return found.stdout.trim()
  }
  return parseDependencyPorts({
    mysql: address('mysql', 3306),
    redis: address('redis', 6379),
    minio: address('minio', 9000),
    minioConsole: address('minio', 9001),
  })
}

export async function probeDependencyPorts(ports, timeoutMs = 5_000) {
  if (!validDependencyPorts(ports)) throw new Error('E2E 依赖探针端口无效。')
  await Promise.all(
    Object.entries(ports).map(
      ([name, port]) =>
        new Promise((resolveProbe, reject) => {
          const socket = createConnection({ host: '127.0.0.1', port })
          const timeout = setTimeout(() => {
            socket.destroy()
            reject(new Error(`E2E ${name} 依赖端口探针超时。`))
          }, timeoutMs)
          socket.once('connect', () => {
            clearTimeout(timeout)
            socket.destroy()
            resolveProbe()
          })
          socket.once('error', (error) => {
            clearTimeout(timeout)
            reject(new Error(`E2E ${name} 依赖端口不可达。`, { cause: error }))
          })
        }),
    ),
  )
}

function validDependencyPorts(ports) {
  const names = ['mysql', 'redis', 'minio', 'minioConsole']
  return (
    ports &&
    typeof ports === 'object' &&
    Object.keys(ports).sort().join('|') === [...names].sort().join('|') &&
    names.every(
      (name) => Number.isSafeInteger(ports[name]) && ports[name] > 0 && ports[name] <= 65_535,
    ) &&
    new Set(Object.values(ports)).size === names.length
  )
}

function validateComposeProjectName(projectName) {
  if (!/^garment-e2e-[a-f0-9]{20}$/.test(projectName))
    throw new Error('E2E Compose project name 无效。')
}

export async function terminateTree(child) {
  if (child && child.exitCode === null) await terminatePid(child.pid)
}

function pidAlive(pid, platform = process.platform) {
  try {
    process.kill(platform === 'win32' ? pid : -pid, 0)
    return true
  } catch {
    return false
  }
}

export async function terminatePid(pid, platform = process.platform, options = {}) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return
  if (platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  const graceMs = options.graceMs ?? 2000
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    return
  }
  const deadline = Date.now() + graceMs
  while (Date.now() < deadline && pidAlive(pid, platform)) {
    await new Promise((accept) => setTimeout(accept, 25))
  }
  if (pidAlive(pid, platform)) {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      /* already exited */
    }
  }
}

export function projectIdentity(projectDirectory) {
  const resolved = resolve(projectDirectory)
  let canonical
  try {
    canonical = realpathSync.native(resolved)
  } catch {
    canonical = resolved
  }
  if (process.platform === 'win32') canonical = canonical.toLowerCase()
  return createHash('sha256').update(canonical).digest('hex')
}

export function stateFile(projectDirectory) {
  return join(tmpdir(), `garment-e2e-${projectIdentity(projectDirectory).slice(0, 16)}.json`)
}

export function lockFile(projectDirectory) {
  return `${stateFile(projectDirectory)}.lock`
}

export function shutdownRequestFile(projectDirectory) {
  return `${stateFile(projectDirectory)}.shutdown`
}

export function recoveryLeasePort(projectDirectory) {
  const prefix = Number.parseInt(projectIdentity(projectDirectory).slice(0, 8), 16)
  return recoveryLeaseFirstPort + (prefix % recoveryLeasePortCount)
}

export function createRunToken() {
  return randomBytes(32).toString('hex')
}

function processStartedAt(pid) {
  const observed = inspectProcess(pid)?.startedAt
  return Number.isFinite(observed) ? observed : Date.now()
}

function lockRecord(projectDirectory, token, owner = {}) {
  return {
    version: stateVersion,
    projectIdentity: projectIdentity(projectDirectory),
    runToken: token,
    ownerPid: owner.pid ?? process.pid,
    ownerStartedAt: new Date(
      owner.startedAt ?? processStartedAt(owner.pid ?? process.pid),
    ).toISOString(),
    createdAt: new Date(owner.now ?? Date.now()).toISOString(),
    stage: 'LOCKED_NO_RESOURCES',
  }
}

export function acquireRunLock(projectDirectory, token, owner) {
  const record = lockRecord(projectDirectory, token, owner)
  let descriptor
  try {
    descriptor = openSync(lockFile(projectDirectory), 'wx', 0o600)
    writeFileSync(descriptor, JSON.stringify(record), 'utf8')
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor)
    throw new Error(`同一项目的 E2E launcher 已正在运行：${error.message}`, { cause: error })
  }
  closeSync(descriptor)
}

function publishRunLock(projectDirectory, token) {
  const current = parseLock(projectDirectory)
  if (!current || current.runToken !== token) throw new Error('运行锁所有权已变化，拒绝发布状态。')
  if (current.stage === 'STATE_PUBLISHED') return
  const temporary = `${lockFile(projectDirectory)}.${token}.tmp`
  writeFileSync(temporary, JSON.stringify({ ...current, stage: 'STATE_PUBLISHED' }), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
  const latest = parseLock(projectDirectory)
  if (!latest || latest.runToken !== token) {
    rmSync(temporary, { force: true })
    throw new Error('运行锁所有权在状态发布期间变化。')
  }
  renameSync(temporary, lockFile(projectDirectory))
}

export function ownsRunLock(projectDirectory, token) {
  try {
    return JSON.parse(readFileSync(lockFile(projectDirectory), 'utf8')).runToken === token
  } catch {
    return false
  }
}

export function requestShutdown(projectDirectory, token) {
  try {
    writeFileSync(shutdownRequestFile(projectDirectory), token, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
  } catch (error) {
    if (!shutdownRequested(projectDirectory, token)) throw error
  }
}

export function shutdownRequested(projectDirectory, token) {
  try {
    return readFileSync(shutdownRequestFile(projectDirectory), 'utf8') === token
  } catch {
    return false
  }
}

export function releaseRunLock(projectDirectory, token) {
  try {
    if (JSON.parse(readFileSync(lockFile(projectDirectory), 'utf8')).runToken === token)
      rmSync(lockFile(projectDirectory), { force: true })
  } catch {
    /* another owner or already removed */
  }
  try {
    const state = JSON.parse(readFileSync(stateFile(projectDirectory), 'utf8'))
    if (state.runToken === token) rmSync(stateFile(projectDirectory), { force: true })
  } catch {
    /* malformed state is never claimed */
  }
  try {
    if (readFileSync(shutdownRequestFile(projectDirectory), 'utf8') === token) {
      rmSync(shutdownRequestFile(projectDirectory), { force: true })
    }
  } catch {
    /* another owner or no request */
  }
}

function timestampMatches(observed, expected) {
  if (!Number.isFinite(observed)) return true
  return Math.abs(observed - expected) <= timestampToleranceMs
}

function validTimestamp(value, now) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && parsed <= now + 60_000
}

function parseLock(projectDirectory, path = lockFile(projectDirectory), now = Date.now()) {
  try {
    const lock = JSON.parse(readFileSync(path, 'utf8'))
    if (
      !exactKeys(lock, [
        'version',
        'projectIdentity',
        'runToken',
        'ownerPid',
        'ownerStartedAt',
        'createdAt',
        'stage',
      ]) ||
      lock.version !== stateVersion ||
      lock.projectIdentity !== projectIdentity(projectDirectory) ||
      !/^[a-f0-9]{64}$/.test(lock.runToken) ||
      !Number.isSafeInteger(lock.ownerPid) ||
      lock.ownerPid <= 0 ||
      !validTimestamp(lock.ownerStartedAt, now) ||
      !validTimestamp(lock.createdAt, now) ||
      !['LOCKED_NO_RESOURCES', 'STATE_PUBLISHED'].includes(lock.stage)
    )
      return undefined
    return lock
  } catch {
    return undefined
  }
}

function markerAllowed(stage, marker, token) {
  if (stage === 'compose') return marker === `garment.e2e.run-token=${token}`
  if (stage === 'build') return marker === `garment.e2e.run-token=${token}`
  if (stage === 'backend') return marker === `garment.e2e.run-token=${token}`
  return false
}

function validProcessIdentityNumber(value) {
  return value === null || (Number.isSafeInteger(value) && value > 0)
}

function validResourceRecord(record, token, now) {
  return (
    exactKeys(record, [
      'pid',
      'processGroupId',
      'sessionId',
      'startedAt',
      'marker',
      'executable',
      'stage',
    ]) &&
    Number.isSafeInteger(record.pid) &&
    record.pid > 0 &&
    validProcessIdentityNumber(record.processGroupId) &&
    validProcessIdentityNumber(record.sessionId) &&
    validTimestamp(record.startedAt, now) &&
    markerAllowed(record.stage, record.marker, token) &&
    typeof record.executable === 'string' &&
    record.executable.length > 0
  )
}

function sameExecutable(left, right, platform) {
  if (!left || !right) return false
  return platform === 'win32'
    ? left.replaceAll('/', '\\').toLowerCase() === right.replaceAll('/', '\\').toLowerCase()
    : left === right
}

export function resourceOwnedByRun(record, observed, options) {
  if (
    !observed ||
    !validResourceRecord(record, options.runToken ?? markerToken(record), Date.now())
  )
    return false
  if (
    observed.pid !== record.pid ||
    !observed.commandLine.includes(record.marker) ||
    !timestampMatches(observed.startedAt, Date.parse(record.startedAt)) ||
    !sameExecutable(observed.executable, record.executable, options.platform)
  )
    return false
  if (options.launcherAlive) return observed.parentPid === options.launcherPid
  if (options.platform !== 'win32') {
    return (
      observed.processGroupId === record.processGroupId && observed.sessionId === record.sessionId
    )
  }
  return observed.parentPid === options.launcherPid
}

function markerToken(record) {
  const match = record.marker.match(/garment\.e2e\.run-token=([a-f0-9]+)/)
  return match?.[1] ?? ''
}

function resourceFromStateIsValid(record, state, launcher, inspect, now, platform) {
  if (record === null) return true
  if (!validResourceRecord(record, state.runToken, now)) return false
  const observed = inspect(record.pid)
  if (!observed) return true
  return resourceOwnedByRun(record, observed, {
    platform,
    launcherPid: state.launcherPid,
    launcherAlive: Boolean(launcher),
    runToken: state.runToken,
  })
}

function readStateForLock(projectDirectory, lock, options = {}) {
  const now = options.now ?? Date.now()
  const inspect = options.inspect || inspectProcess
  try {
    const state = JSON.parse(readFileSync(stateFile(projectDirectory), 'utf8'))
    if (
      !exactKeys(state, [
        'version',
        'projectIdentity',
        'runToken',
        'launcherPid',
        'launcherStartedAt',
        'backendPid',
        'backendStartedAt',
        'backendResource',
        'activeChild',
        'composeCleanup',
        'dependencyPorts',
      ])
    )
      return undefined
    if (
      state.version !== stateVersion ||
      state.projectIdentity !== projectIdentity(projectDirectory) ||
      state.runToken !== lock.runToken ||
      state.launcherPid !== lock.ownerPid ||
      state.launcherStartedAt !== lock.ownerStartedAt
    )
      return undefined
    if (
      !validTimestamp(state.launcherStartedAt, now) ||
      !validCleanupPlan(state.composeCleanup) ||
      (state.dependencyPorts !== null && !validDependencyPorts(state.dependencyPorts))
    )
      return undefined
    const launcher = inspect(state.launcherPid)
    if (launcher) {
      if (!launcher.commandLine.includes('e2e-web-server.mjs')) return undefined
      if (!timestampMatches(launcher.startedAt, Date.parse(state.launcherStartedAt)))
        return undefined
    } else if (!options.allowDeadLauncher) return undefined
    const platform = options.platform ?? process.platform
    if (!resourceFromStateIsValid(state.activeChild, state, launcher, inspect, now, platform))
      return undefined
    if ((state.backendPid === null) !== (state.backendStartedAt === null)) return undefined
    if ((state.backendPid === null) !== (state.backendResource === null)) return undefined
    if (state.backendPid !== null) {
      if (!validDependencyPorts(state.dependencyPorts)) return undefined
      if (!Number.isSafeInteger(state.backendPid) || state.backendPid <= 0) return undefined
      if (!validTimestamp(state.backendStartedAt, now)) return undefined
      if (
        state.backendResource.pid !== state.backendPid ||
        state.backendResource.startedAt !== state.backendStartedAt ||
        state.backendResource.stage !== 'backend' ||
        !resourceFromStateIsValid(state.backendResource, state, launcher, inspect, now, platform)
      )
        return undefined
    }
    return state
  } catch {
    return undefined
  }
}

async function acquireRecoveryLease(projectDirectory, options = {}) {
  const port = recoveryLeasePort(projectDirectory)
  const deadline = Date.now() + (options.waitMs ?? recoveryLeaseWaitMs)
  while (true) {
    const server = createServer((socket) => socket.destroy())
    try {
      await new Promise((accept, reject) => {
        const onError = (error) => reject(error)
        server.once('error', onError)
        server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
          server.off('error', onError)
          accept()
        })
      })
      return server
    } catch (error) {
      if (error?.code !== 'EADDRINUSE')
        throw new Error(`无法取得 E2E 恢复 socket 租约（127.0.0.1:${port}）。`, {
          cause: error,
        })
      if (Date.now() >= deadline)
        throw new Error(
          `等待 E2E 恢复 socket 租约超时（127.0.0.1:${port}，端口可能由未知进程占用）。`,
          { cause: error },
        )
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25))
    }
  }
}

async function releaseRecoveryLease(server) {
  if (!server.listening) return
  await new Promise((accept, reject) => {
    server.close((error) => (error ? reject(error) : accept()))
  })
}

export async function withRecoveryLease(projectDirectory, leaseToken, operation, options = {}) {
  if (!/^[a-f0-9]{64}$/.test(leaseToken)) throw new Error('E2E 恢复租约 token 无效。')
  const server = await acquireRecoveryLease(projectDirectory, options)
  try {
    return await operation()
  } finally {
    await releaseRecoveryLease(server)
  }
}

function noResourcesPublished(projectDirectory, lock) {
  if (lock.stage !== 'LOCKED_NO_RESOURCES') return false
  if (!existsSync(stateFile(projectDirectory))) return true
  const state = readStateForLock(projectDirectory, lock, {
    allowDeadLauncher: true,
    inspect: () => undefined,
  })
  return Boolean(state && state.activeChild === null && state.backendResource === null)
}

export async function acquireOrRecoverRunLock(projectDirectory, token, options = {}) {
  const inspect = options.inspect || inspectProcess
  return withRecoveryLease(
    projectDirectory,
    token,
    async () => {
      const oldLock = parseLock(
        projectDirectory,
        lockFile(projectDirectory),
        options.now ?? Date.now(),
      )
      if (!oldLock) {
        if (existsSync(lockFile(projectDirectory)))
          throw new Error('现有 E2E 运行锁无效，拒绝自动覆盖。')
        acquireRunLock(projectDirectory, token, options.owner)
        return { recovered: false }
      }
      const owner = inspect(oldLock.ownerPid)
      if (owner && timestampMatches(owner.startedAt, Date.parse(oldLock.ownerStartedAt))) {
        throw new Error('同一项目的 E2E launcher 已正在运行。')
      }

      const quarantine = `${lockFile(projectDirectory)}.quarantine.${token}`
      renameSync(lockFile(projectDirectory), quarantine)
      try {
        const quarantined = parseLock(projectDirectory, quarantine, options.now ?? Date.now())
        if (!quarantined || quarantined.runToken !== oldLock.runToken)
          throw new Error('陈旧 E2E 锁在接管期间被篡改。')
        acquireRunLock(projectDirectory, token, options.owner)
        if (!noResourcesPublished(projectDirectory, quarantined)) {
          const staleState = readStateForLock(projectDirectory, quarantined, {
            inspect,
            now: options.now,
            allowDeadLauncher: true,
            platform: options.platform,
          })
          if (!staleState) throw new Error('陈旧 E2E 状态无法通过所有权校验，拒绝接管。')
          const recover = options.recover || recoverOwnedRun
          await recover(projectDirectory, staleState, {
            inspect,
            platform: options.platform,
          })
        }
        rmSync(stateFile(projectDirectory), { force: true })
        rmSync(shutdownRequestFile(projectDirectory), { force: true })
        rmSync(quarantine, { force: true })
        return { recovered: true, previousToken: oldLock.runToken }
      } catch (error) {
        releaseRunLock(projectDirectory, token)
        if (!existsSync(lockFile(projectDirectory)) && existsSync(quarantine))
          renameSync(quarantine, lockFile(projectDirectory))
        throw error
      }
    },
    { waitMs: options.waitMs },
  )
}

export async function recoverRunByToken(projectDirectory, expectedToken, options = {}) {
  const inspect = options.inspect || inspectProcess
  return cleanupRunByToken(
    projectDirectory,
    expectedToken,
    async (state) => {
      await (options.recover || recoverOwnedRun)(projectDirectory, state, {
        inspect,
        platform: options.platform,
        terminateLauncher: true,
      })
    },
    options,
  )
}

export async function cleanupRunByToken(projectDirectory, expectedToken, cleanup, options = {}) {
  const inspect = options.inspect || inspectProcess
  const leaseToken = options.leaseToken || createRunToken()
  return withRecoveryLease(
    projectDirectory,
    leaseToken,
    async () => {
      const currentLock = parseLock(projectDirectory)
      if (!currentLock || currentLock.runToken !== expectedToken) return false
      const state = readStateForLock(projectDirectory, currentLock, {
        inspect,
        allowDeadLauncher: true,
        platform: options.platform,
      })
      if (!state) return false
      await cleanup(state)
      releaseRunLock(projectDirectory, expectedToken)
      return true
    },
    { waitMs: options.waitMs },
  )
}

export function atomicWriteState(projectDirectory, token, state) {
  const temporary = `${stateFile(projectDirectory)}.${token}.tmp`
  writeFileSync(temporary, JSON.stringify(state), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  renameSync(temporary, stateFile(projectDirectory))
  publishRunLock(projectDirectory, token)
}

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === 'object' &&
    Object.keys(value).sort().join('|') === [...expected].sort().join('|')
  )
}

function validCleanupPlan(plan) {
  if (!exactKeys(plan, ['projectName', 'mode', 'services', 'removeVolumes'])) return false
  try {
    validateComposeProjectName(plan.projectName)
  } catch {
    return false
  }
  return (
    plan.mode === 'down' &&
    plan.removeVolumes === true &&
    Array.isArray(plan.services) &&
    plan.services.join('|') === dependencyServices.join('|')
  )
}

export function inspectProcess(pid, platform = process.platform) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined
  if (platform === 'win32') {
    const script = `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}';if($p){[pscustomobject]@{ProcessId=$p.ProcessId;ParentProcessId=$p.ParentProcessId;CommandLine=$p.CommandLine;StartedAt=$p.CreationDate.ToUniversalTime().ToString('o');ExecutablePath=$p.ExecutablePath;SessionId=$p.SessionId}|ConvertTo-Json -Compress}`
    const found = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        encoding: 'utf8',
        windowsHide: true,
      },
    )
    if (found.status !== 0 || !found.stdout.trim()) return undefined
    try {
      const value = JSON.parse(found.stdout)
      return {
        pid: Number(value.ProcessId),
        parentPid: Number(value.ParentProcessId),
        processGroupId: null,
        sessionId: Number(value.SessionId) || null,
        commandLine: String(value.CommandLine || ''),
        startedAt: Date.parse(value.StartedAt),
        executable: String(value.ExecutablePath || ''),
      }
    } catch {
      return undefined
    }
  }
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const matched = stat.match(/^\d+ \(.+\) \S (\d+) (\d+) (\d+)/)
    const started = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' })
    return {
      pid,
      parentPid: Number(matched?.[1]),
      processGroupId: Number(matched?.[2]),
      sessionId: Number(matched?.[3]),
      commandLine: readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' '),
      startedAt: started.status === 0 ? Date.parse(started.stdout.trim()) : undefined,
      executable: readlinkSync(`/proc/${pid}/exe`),
    }
  } catch {
    return undefined
  }
}

export function processResourceRecord(pid, stage, marker, options = {}) {
  const observed = (options.inspect || inspectProcess)(pid)
  if (!observed) throw new Error(`无法探测 ${stage} 子进程 ${pid} 的归属信息。`)
  return {
    pid,
    processGroupId: observed.processGroupId ?? null,
    sessionId: observed.sessionId ?? null,
    startedAt: new Date(observed.startedAt ?? Date.now()).toISOString(),
    marker,
    executable: observed.executable,
    stage,
  }
}

export function readOwnedState(projectDirectory, options = {}) {
  const now = options.now ?? Date.now()
  const lock = parseLock(projectDirectory, lockFile(projectDirectory), now)
  return lock ? readStateForLock(projectDirectory, lock, { ...options, now }) : undefined
}

export async function recoverOwnedRun(projectDirectory, state, options = {}) {
  const inspect = options.inspect || inspectProcess
  const platform = options.platform ?? process.platform
  const launcher = inspect(state.launcherPid)
  if (state.activeChild) {
    const active = inspect(state.activeChild.pid)
    if (
      resourceOwnedByRun(state.activeChild, active, {
        platform,
        launcherPid: state.launcherPid,
        launcherAlive: Boolean(launcher),
        runToken: state.runToken,
      })
    )
      await terminateResource(state.activeChild, platform)
  }
  if (state.backendResource !== null && state.backendPid !== state.activeChild?.pid) {
    const backend = inspect(state.backendPid)
    if (
      resourceOwnedByRun(state.backendResource, backend, {
        platform,
        launcherPid: state.launcherPid,
        launcherAlive: Boolean(launcher),
        runToken: state.runToken,
      }) &&
      backend.commandLine.includes('garment-saas-backend')
    )
      await terminateResource(state.backendResource, platform)
  }
  if (
    options.terminateLauncher &&
    launcher?.commandLine.includes('e2e-web-server.mjs') &&
    timestampMatches(launcher.startedAt, Date.parse(state.launcherStartedAt))
  )
    await terminatePid(state.launcherPid)
  await cleanupCompose(projectDirectory, state.composeCleanup)
}

async function terminateResource(resource, platform) {
  const target = platform === 'win32' ? resource.pid : resource.processGroupId
  if (target) await terminatePid(target, platform)
}

export function projectRoot(metaUrl) {
  return resolve(dirname(fileURLToPath(metaUrl)), '..', '..', '..')
}
