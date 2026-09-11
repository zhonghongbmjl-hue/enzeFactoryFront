import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as launcher from './e2e-launcher.mjs'
import {
  cleanupPlan,
  commandInvocation,
  acquireRunLock,
  acquireOrRecoverRunLock,
  atomicWriteState,
  createRunToken,
  dependencyServices,
  projectIdentity,
  readOwnedState,
  releaseRunLock,
  requestShutdown,
  shutdownRequested,
  resolveToolchain,
  stateFile,
  stateVersion,
  terminatePid,
  wrapperName,
} from './e2e-launcher.mjs'

const launcherSource = readFileSync(
  fileURLToPath(new URL('./e2e-launcher.mjs', import.meta.url)),
  'utf8',
)
const webServerSource = readFileSync(
  fileURLToPath(new URL('./e2e-web-server.mjs', import.meta.url)),
  'utf8',
)
const playwrightConfigSource = readFileSync(
  fileURLToPath(new URL('../../playwright.config.ts', import.meta.url)),
  'utf8',
)

test('每轮使用唯一 Compose project 且所有命令显式携带该名称', () => {
  const first = launcher.composeProjectName('a'.repeat(64))
  const second = launcher.composeProjectName('b'.repeat(64))

  assert.notEqual(first, second)
  assert.match(first, /^garment-e2e-[a-f0-9]+$/)
  assert.doesNotMatch(webServerSource, /E2E_REUSE_COMPOSE/)
  assert.doesNotMatch(launcherSource, /\['compose',\s*'(?:up|ps|down|stop|rm)'/)
  assert.match(launcherSource, /'compose',\s*'--project-name'/)
})

test('每轮依赖端口由Docker唯一分配并可严格解析后写入后端环境', () => {
  assert.deepEqual(launcher.dependencyComposeEnvironment(), {
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
  })
  assert.doesNotMatch(JSON.stringify(launcher.dependencyComposeEnvironment()), /change-me/i)
  assert.deepEqual(
    launcher.parseDependencyPorts({
      mysql: '127.0.0.1:49101',
      redis: '127.0.0.1:49102',
      minio: '127.0.0.1:49103',
      minioConsole: '127.0.0.1:49104',
    }),
    { mysql: 49101, redis: 49102, minio: 49103, minioConsole: 49104 },
  )
  assert.throws(() => launcher.parseDependencyPorts({ mysql: '0.0.0.0:3306' }), /依赖端口/)
  assert.match(webServerSource, /dependencyPorts/)
  assert.match(webServerSource, /SPRING_DATASOURCE_URL/)
  assert.match(webServerSource, /SPRING_DATASOURCE_USERNAME:\s*composeEnvironment\.MYSQL_USER/)
  assert.match(webServerSource, /SPRING_DATASOURCE_PASSWORD:\s*composeEnvironment\.MYSQL_PASSWORD/)
  assert.match(webServerSource, /SPRING_DATA_REDIS_PORT/)
  assert.match(webServerSource, /SPRING_DATA_REDIS_PASSWORD:\s*composeEnvironment\.REDIS_PASSWORD/)
  assert.match(webServerSource, /APP_STORAGE_ENDPOINT/)
  assert.match(webServerSource, /MINIO_SECRET_KEY:\s*composeEnvironment\.MINIO_APP_SECRET_KEY/)
  assert.match(webServerSource, /JWT_SECRET:\s*composeEnvironment\.JWT_SECRET/)
  assert.match(webServerSource, /LOCAL_DEMO_PASSWORD:\s*composeEnvironment\.LOCAL_DEMO_PASSWORD/)
})

test('Playwright 只在证据存储 readiness 就绪后启动业务场景', () => {
  assert.match(
    playwrightConfigSource,
    /url:\s*['"]http:\/\/127\.0\.0\.1:18080\/actuator\/health\/readiness['"]/,
  )
})

test('按平台选择 Maven Wrapper', () => {
  assert.equal(wrapperName('win32'), 'mvnw.cmd')
  assert.equal(wrapperName('linux'), 'mvnw')
})

test('唯一项目始终由本任务完整down并删除本轮卷', () => {
  const projectName = launcher.composeProjectName('c'.repeat(64))
  assert.deepEqual(cleanupPlan(projectName), {
    projectName,
    mode: 'down',
    services: dependencyServices,
    removeVolumes: true,
  })
})

test('唯一项目清理使用--volumes且绝不发现或复用固定开发容器', () => {
  assert.match(launcherSource, /'down',\s*'--volumes'/)
  assert.doesNotMatch(webServerSource, /runningComposeServices|E2E_REUSE_COMPOSE/)
})

test('运行状态文件位于系统临时目录且项目隔离', () => {
  assert.notEqual(stateFile('/workspace/a'), stateFile('/workspace/b'))
  assert.match(stateFile('/workspace/a'), /garment-e2e-[a-f0-9]{16}\.json$/)
})

test('Windows 可执行含空格路径中的 cmd wrapper', { skip: process.platform !== 'win32' }, () => {
  const wrapper = fileURLToPath(new URL('./fixtures/echo-args.cmd', import.meta.url))
  const invocation = commandInvocation(wrapper, ['hello world'], 'win32')
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    shell: invocation.shell,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  })
  assert.equal(result.status, 0, JSON.stringify({ invocation, stderr: result.stderr }))
  assert.equal(result.stdout.trim(), 'hello world')
})

test('Windows Java 和 Docker 可执行文件直接作为 launcher 子进程', () => {
  assert.deepEqual(commandInvocation('java', ['-version'], 'win32'), {
    command: 'java',
    args: ['-version'],
    shell: false,
  })
  assert.equal(commandInvocation('docker.exe', ['version'], 'win32').command, 'docker.exe')
})

test('无效或低版本 JAVA_HOME 会被 PATH Java 的真实 java.home 覆盖', () => {
  const toolchain = resolveToolchain(
    '/project',
    'linux',
    { JAVA_HOME: '/java-8' },
    {
      exists: (path) => {
        const normalized = path.replaceAll('\\', '/')
        return normalized.endsWith('backend/mvnw') || normalized.endsWith('java-8/bin/java')
      },
      commandAvailable: (command) => command === 'java',
      probeJava: (command) =>
        command === 'java' ? { major: 25, home: '/path-java-25' } : { major: 8, home: '/java-8' },
    },
  )
  assert.equal(toolchain.javaHome, '/path-java-25')
  assert.equal(toolchain.javaCommand, 'java')
})

test('状态锁独占且状态通过临时文件原子替换', () => {
  const root = mkdtempSync(join(tmpdir(), 'garment-e2e-lock-'))
  const token = createRunToken()
  try {
    acquireRunLock(root, token)
    assert.throws(() => acquireRunLock(root, createRunToken()), /正在运行/)
    atomicWriteState(root, token, {
      version: stateVersion,
      projectIdentity: 'a'.repeat(64),
      runToken: token,
      launcherPid: 11,
      backendPid: null,
      startedAt: new Date().toISOString(),
      composeCleanup: { mode: 'none', services: [] },
    })
    assert.equal(JSON.parse(readFileSync(stateFile(root), 'utf8')).runToken, token)
    requestShutdown(root, token)
    assert.equal(shutdownRequested(root, token), true)
    assert.equal(shutdownRequested(root, createRunToken()), false)
  } finally {
    releaseRunLock(root, token)
    rmSync(root, { recursive: true, force: true })
  }
})

test('拒绝半写、陈旧、篡改、PID 复用和错误父子归属的状态', () => {
  const root = mkdtempSync(join(tmpdir(), 'garment-e2e-state-'))
  const token = createRunToken()
  const now = Date.now()
  const valid = {
    version: stateVersion,
    projectIdentity: undefined,
    runToken: token,
    launcherPid: 101,
    launcherStartedAt: new Date(now).toISOString(),
    backendPid: 202,
    backendStartedAt: new Date(now).toISOString(),
    backendResource: {
      pid: 202,
      processGroupId: null,
      sessionId: null,
      startedAt: new Date(now).toISOString(),
      marker: `garment.e2e.run-token=${token}`,
      executable: 'test-java',
      stage: 'backend',
    },
    activeChild: null,
    composeCleanup: cleanupPlan(launcher.composeProjectName(token)),
    dependencyPorts: { mysql: 49101, redis: 49102, minio: 49103, minioConsole: 49104 },
  }
  const identities = new Map([
    [101, { pid: 101, parentPid: 1, commandLine: 'node e2e-web-server.mjs', startedAt: now }],
    [
      202,
      {
        pid: 202,
        parentPid: 101,
        commandLine: `java -Dgarment.e2e.run-token=${token} -jar garment-saas-backend.jar`,
        startedAt: now,
        executable: 'test-java',
      },
    ],
  ])
  const inspect = (pid) => identities.get(pid)
  try {
    acquireRunLock(root, token, { pid: 101, startedAt: now, now })
    valid.projectIdentity = projectIdentity(root)
    writeFileSync(stateFile(root), '{"version":')
    assert.equal(readOwnedState(root, { inspect, now }), undefined)

    atomicWriteState(root, token, {
      ...valid,
      launcherStartedAt: new Date(now - 3_600_000).toISOString(),
    })
    assert.equal(readOwnedState(root, { inspect, now }), undefined)

    atomicWriteState(root, token, { ...valid, projectIdentity: 'b'.repeat(64) })
    assert.equal(readOwnedState(root, { inspect, now }), undefined)

    atomicWriteState(root, token, {
      ...valid,
      composeCleanup: {
        ...cleanupPlan(launcher.composeProjectName(token)),
        services: ['mysql', 'backend'],
      },
    })
    assert.equal(readOwnedState(root, { inspect, now }), undefined)

    atomicWriteState(root, token, { ...valid, unexpected: 'tampered' })
    assert.equal(readOwnedState(root, { inspect, now }), undefined)

    atomicWriteState(root, token, valid)
    identities.set(202, { ...identities.get(202), commandLine: 'java -jar unrelated.jar' })
    assert.equal(readOwnedState(root, { inspect, now }), undefined)
    identities.set(202, {
      ...identities.get(202),
      commandLine: `java -Dgarment.e2e.run-token=${token} -jar garment-saas-backend.jar`,
      parentPid: 999,
    })
    assert.equal(readOwnedState(root, { inspect, now }), undefined)

    identities.set(202, { ...identities.get(202), parentPid: 101 })
    assert.equal(readOwnedState(root, { inspect, now })?.runToken, token)
  } finally {
    releaseRunLock(root, token)
    rmSync(root, { recursive: true, force: true })
  }
})

test('冷构建超过两分钟后按 backendStartedAt 校验后端归属', () => {
  const root = mkdtempSync(join(tmpdir(), 'garment-e2e-cold-'))
  const token = createRunToken()
  const now = Date.now()
  const launcherStartedAt = now - 180_000
  const state = ownedState(root, token, {
    launcherStartedAt,
    backendPid: 202,
    backendStartedAt: now,
  })
  const inspect = (pid) =>
    new Map([
      [
        101,
        {
          pid: 101,
          parentPid: 1,
          commandLine: 'node e2e-web-server.mjs',
          startedAt: launcherStartedAt,
        },
      ],
      [
        202,
        {
          pid: 202,
          parentPid: 101,
          commandLine: `java -Dgarment.e2e.run-token=${token} -jar garment-saas-backend.jar`,
          startedAt: now,
          executable: 'test-java',
        },
      ],
    ]).get(pid)
  try {
    acquireRunLock(root, token, { pid: 101, startedAt: launcherStartedAt, now })
    atomicWriteState(root, token, state)
    assert.equal(readOwnedState(root, { inspect, now })?.backendPid, 202)
  } finally {
    releaseRunLock(root, token)
    rmSync(root, { recursive: true, force: true })
  }
})

test('存活 owner 的 31 分钟和隔夜锁仍保持独占', async () => {
  for (const age of [31 * 60_000, 24 * 60 * 60_000]) {
    const root = mkdtempSync(join(tmpdir(), 'garment-e2e-long-owner-'))
    const oldToken = createRunToken()
    const nextToken = createRunToken()
    const now = Date.now()
    const startedAt = now - age
    try {
      acquireRunLock(root, oldToken, { pid: 101, startedAt, now: startedAt })
      atomicWriteState(root, oldToken, ownedState(root, oldToken, { launcherStartedAt: startedAt }))
      await assert.rejects(
        acquireOrRecoverRunLock(root, nextToken, {
          now,
          owner: { pid: 202, startedAt: now, now },
          inspect: (pid) =>
            pid === 101
              ? {
                  pid,
                  parentPid: 1,
                  commandLine: 'node e2e-web-server.mjs',
                  startedAt,
                }
              : undefined,
        }),
        /正在运行/,
      )
      assert.equal(readFileSafely(`${stateFile(root)}.lock`).includes(oldToken), true)
    } finally {
      releaseRunLock(root, nextToken)
      releaseRunLock(root, oldToken)
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('死亡 owner 的隔夜状态仍可安全恢复', async () => {
  const root = mkdtempSync(join(tmpdir(), 'garment-e2e-overnight-recovery-'))
  const oldToken = createRunToken()
  const nextToken = createRunToken()
  const now = Date.now()
  const startedAt = now - 24 * 60 * 60_000
  let recovered = false
  try {
    acquireRunLock(root, oldToken, { pid: 101, startedAt, now: startedAt })
    atomicWriteState(root, oldToken, ownedState(root, oldToken, { launcherStartedAt: startedAt }))
    const result = await acquireOrRecoverRunLock(root, nextToken, {
      now,
      owner: { pid: 202, startedAt: now, now },
      inspect: () => undefined,
      recover: async () => (recovered = true),
    })
    assert.equal(result.recovered, true)
    assert.equal(recovered, true)
  } finally {
    releaseRunLock(root, nextToken)
    releaseRunLock(root, oldToken)
    rmSync(root, { recursive: true, force: true })
  }
})

test('owner 在 state 发布前硬崩溃时可凭无资源锁接管', async () => {
  const root = mkdtempSync(join(tmpdir(), 'garment-e2e-lock-only-'))
  const oldToken = createRunToken()
  const nextToken = createRunToken()
  const now = Date.now()
  try {
    acquireRunLock(root, oldToken, { pid: 101, startedAt: now - 10_000, now: now - 10_000 })
    const initialLock = JSON.parse(readFileSync(`${stateFile(root)}.lock`, 'utf8'))
    assert.equal(initialLock.stage, 'LOCKED_NO_RESOURCES')
    const result = await acquireOrRecoverRunLock(root, nextToken, {
      now,
      owner: { pid: 202, startedAt: now, now },
      inspect: () => undefined,
    })
    assert.deepEqual(result, { recovered: true, previousToken: oldToken })
  } finally {
    releaseRunLock(root, nextToken)
    releaseRunLock(root, oldToken)
    rmSync(root, { recursive: true, force: true })
  }
})

test('构建阶段 activeChild 有独立启动时间和 token marker', () => {
  const root = mkdtempSync(join(tmpdir(), 'garment-e2e-building-'))
  const token = createRunToken()
  const now = Date.now()
  const state = ownedState(root, token, {
    activeChild: {
      pid: 303,
      startedAt: now,
      marker: `garment.e2e.run-token=${token}`,
      stage: 'build',
    },
  })
  const inspect = (pid) =>
    new Map([
      [101, { pid: 101, parentPid: 1, commandLine: 'node e2e-web-server.mjs', startedAt: now }],
      [
        303,
        {
          pid: 303,
          parentPid: 101,
          commandLine: `mvn -Dgarment.e2e.run-token=${token} package`,
          startedAt: now,
          executable: 'test-maven',
        },
      ],
    ]).get(pid)
  try {
    acquireRunLock(root, token, { pid: 101, startedAt: now, now })
    atomicWriteState(root, token, state)
    assert.equal(readOwnedState(root, { inspect, now })?.activeChild.stage, 'build')
  } finally {
    releaseRunLock(root, token)
    rmSync(root, { recursive: true, force: true })
  }
})

test('POSIX owner 死亡后允许按 PGID、session、token、时间和 executable 认领 reparent 子进程', () => {
  assert.equal(typeof launcher.resourceOwnedByRun, 'function')
  const startedAt = Date.now() - 10_000
  const record = {
    pid: 303,
    processGroupId: 303,
    sessionId: 303,
    startedAt: new Date(startedAt).toISOString(),
    marker: 'garment.e2e.run-token=abc',
    executable: '/usr/bin/java',
    stage: 'build',
  }
  const observed = {
    pid: 303,
    parentPid: 1,
    processGroupId: 303,
    sessionId: 303,
    startedAt,
    commandLine: 'java -Dgarment.e2e.run-token=abc package',
    executable: '/usr/bin/java',
  }
  assert.equal(
    launcher.resourceOwnedByRun(record, observed, {
      platform: 'linux',
      launcherPid: 101,
      launcherAlive: false,
    }),
    true,
  )
  assert.equal(
    launcher.resourceOwnedByRun(
      record,
      { ...observed, processGroupId: 999 },
      {
        platform: 'linux',
        launcherPid: 101,
        launcherAlive: false,
      },
    ),
    false,
  )
  for (const changed of [
    { ...observed, sessionId: 999 },
    { ...observed, executable: '/usr/bin/unrelated' },
    { ...observed, commandLine: 'java package' },
    { ...observed, startedAt: startedAt + 10_000 },
  ]) {
    assert.equal(
      launcher.resourceOwnedByRun(record, changed, {
        platform: 'linux',
        launcherPid: 101,
        launcherAlive: false,
      }),
      false,
    )
  }
  assert.equal(
    launcher.resourceOwnedByRun(record, observed, {
      platform: 'linux',
      launcherPid: 101,
      launcherAlive: true,
    }),
    false,
  )
})

test('恢复 socket lease 端口按 canonical project identity 稳定派生且避开应用端口', () => {
  assert.equal(typeof launcher.recoveryLeasePort, 'function')
  const first = launcher.recoveryLeasePort('/workspace/a')
  assert.equal(first, launcher.recoveryLeasePort('/workspace/a'))
  assert.notEqual(first, launcher.recoveryLeasePort('/workspace/b'))
  assert.ok(first >= 38_000 && first <= 39_999)
  assert.equal([18080, 8080, 4173].includes(first), false)
})

test('恢复 socket lease 对同一 canonical 目录的 junction 或 symlink 使用相同端口', () => {
  const root = mkdtempSync(join(tmpdir(), 'garment-e2e-canonical-project-'))
  const alias = `${root}-alias`
  try {
    symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir')
    assert.equal(projectIdentity(alias), projectIdentity(root))
    assert.equal(launcher.recoveryLeasePort(alias), launcher.recoveryLeasePort(root))
  } finally {
    unlinkSync(alias)
    rmSync(root, { recursive: true, force: true })
  }
})

test('恢复 socket lease 不创建 recovery 文件且 close 后端口可立即复用', async () => {
  assert.equal(typeof launcher.withRecoveryLease, 'function')
  const root = mkdtempSync(join(tmpdir(), 'garment-e2e-socket-lease-'))
  const token = createRunToken()
  const legacyRecoveryFile = `${stateFile(root)}.recovery`
  try {
    await launcher.withRecoveryLease(root, token, async () => {
      assert.equal(readFileSafely(legacyRecoveryFile), '')
    })
    await launcher.withRecoveryLease(root, createRunToken(), async () => {})
    assert.equal(readFileSafely(legacyRecoveryFile), '')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('未知监听者占用恢复端口时 fail-safe 拒绝且不改变旧 lock/state', async () => {
  const root = mkdtempSync(join(tmpdir(), 'garment-e2e-unknown-listener-'))
  const oldToken = createRunToken()
  const nextToken = createRunToken()
  const now = Date.now()
  const server = createServer()
  try {
    await listen(server, launcher.recoveryLeasePort(root))
    acquireRunLock(root, oldToken, { pid: 999_990, startedAt: now - 10_000, now: now - 10_000 })
    atomicWriteState(
      root,
      oldToken,
      ownedState(root, oldToken, { launcherPid: 999_990, launcherStartedAt: now - 10_000 }),
    )
    await assert.rejects(
      acquireOrRecoverRunLock(root, nextToken, {
        inspect: () => undefined,
        waitMs: 100,
        owner: { pid: process.pid, startedAt: now, now },
      }),
      /恢复租约|EADDRINUSE|超时/,
    )
    assert.equal(JSON.parse(readFileSync(`${stateFile(root)}.lock`, 'utf8')).runToken, oldToken)
  } finally {
    await closeServer(server)
    releaseRunLock(root, nextToken)
    releaseRunLock(root, oldToken)
    rmSync(root, { recursive: true, force: true })
  }
})

test('Compose detached child 通过 Node wrapper 携带 run token marker', () => {
  assert.match(webServerSource, /e2e-command-wrapper\.mjs/)
  assert.doesNotMatch(webServerSource, /'frontend',\s*'e2e',\s*'support'/)
  assert.match(
    webServerSource,
    /recordActiveChild\([\s\S]*?'compose'[\s\S]*?garment\.e2e\.run-token=/,
  )
})

test('Maven detached child 也通过稳定 executable 的 Node wrapper 启动', () => {
  assert.equal(webServerSource.match(/await runChecked\(\s*process\.execPath/g)?.length, 2)
  assert.match(webServerSource, /commandWrapper,[\s\S]*?toolchain\.mavenCommand/)
})

test('正常 shutdown 通过共享 cleanupRunByToken 入口清理且不直接释放锁', () => {
  assert.match(webServerSource, /cleanupRunByToken\(projectDirectory, runToken/)
  assert.doesNotMatch(webServerSource, /releaseRunLock/)
  assert.match(webServerSource, /shutdownPromise \|\|= performShutdown/)
})

test('正常 shutdown 与五秒后 global fallback 共享 lease 且只清理一次', async () => {
  const root = mkdtempSync(join(tmpdir(), 'garment-e2e-normal-shutdown-race-'))
  const fixture = fileURLToPath(new URL('./fixtures/e2e-web-server.mjs', import.meta.url))
  const recoveryWorker = fileURLToPath(new URL('./fixtures/recovery-worker.mjs', import.meta.url))
  const start = join(root, 'start-shutdown')
  const release = join(root, 'release-shutdown')
  const held = join(root, 'shutdown-held')
  const cleanupLog = join(root, 'cleanup-log')
  const ready = join(root, 'ready.json')
  let launcherChild
  let fallback
  let readyState
  try {
    launcherChild = spawn(
      process.execPath,
      [fixture, root, start, release, held, cleanupLog, ready],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    const launcherResult = collectJson(launcherChild)
    await waitUntil(() => readFileSafely(ready) !== '')
    readyState = JSON.parse(readFileSync(ready, 'utf8'))
    writeFileSync(start, 'start')
    await waitUntil(() => readFileSafely(held) === 'held')

    await new Promise((resolve) => setTimeout(resolve, 5100))
    fallback = spawn(
      process.execPath,
      [recoveryWorker, 'fallback', root, readyState.runToken, cleanupLog],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const fallbackResult = collectJson(fallback)
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.deepEqual(readFileSafely(cleanupLog).trim().split(/\r?\n/), ['normal'])

    writeFileSync(release, 'release')
    assert.deepEqual(await launcherResult, { ok: true, cleaned: true })
    assert.deepEqual(await fallbackResult, { ok: true, recovered: false })
    await waitUntil(() => !isAlive(readyState.childPid))
    assert.equal(readFileSafely(`${stateFile(root)}.lock`), '')
  } finally {
    if (fallback && isAlive(fallback.pid)) hardKillSingleProcess(fallback.pid)
    if (launcherChild && isAlive(launcherChild.pid)) hardKillSingleProcess(launcherChild.pid)
    if (readyState?.childPid && isAlive(readyState.childPid))
      hardKillSingleProcess(readyState.childPid)
    if (readyState?.runToken) releaseRunLock(root, readyState.runToken)
    rmSync(root, { recursive: true, force: true })
  }
})

test('真实 socket lease owner SIGKILL 后两个 Node takeover 仅一个进入 destructive section', async () => {
  const root = mkdtempSync(join(tmpdir(), 'garment-e2e-multiprocess-takeover-'))
  const oldToken = createRunToken()
  const now = Date.now()
  const worker = fileURLToPath(new URL('./fixtures/recovery-worker.mjs', import.meta.url))
  const gate = join(root, 'lease-holder')
  const entered = join(root, 'entered-destructive')
  let holder
  try {
    acquireRunLock(root, oldToken, { pid: 999_991, startedAt: now - 10_000, now: now - 10_000 })
    atomicWriteState(
      root,
      oldToken,
      ownedState(root, oldToken, { launcherPid: 999_991, launcherStartedAt: now - 10_000 }),
    )
    holder = spawn(process.execPath, [worker, 'hold-lease', root, gate], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    await waitUntil(() => readFileSafely(`${gate}.held`) === 'held')
    const first = spawn(process.execPath, [worker, 'takeover', root, entered], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const second = spawn(process.execPath, [worker, 'takeover', root, entered], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.equal(readFileSafely(entered), '')
    assert.equal(JSON.parse(readFileSync(`${stateFile(root)}.lock`, 'utf8')).runToken, oldToken)
    hardKillSingleProcess(holder.pid)
    await waitUntil(() => !isAlive(holder.pid))
    const results = await Promise.all([collectJson(first), collectJson(second)])
    assert.equal(results.filter((result) => result.ok).length, 1)
    assert.equal(readFileSafely(entered).trim().split(/\r?\n/).filter(Boolean).length, 1)
    assert.equal(readFileSafely(`${stateFile(root)}.recovery`), '')
  } finally {
    if (holder && isAlive(holder.pid)) hardKillSingleProcess(holder.pid)
    releaseRunLock(root, oldToken)
    rmSync(root, { recursive: true, force: true })
  }
})

test('teardown 持恢复租约时新 run 等待且不会被旧 cleanup 清理', async () => {
  const root = mkdtempSync(join(tmpdir(), 'garment-e2e-teardown-race-'))
  const oldToken = createRunToken()
  const now = Date.now()
  const worker = fileURLToPath(new URL('./fixtures/recovery-worker.mjs', import.meta.url))
  const gate = join(root, 'release-teardown')
  try {
    acquireRunLock(root, oldToken, { pid: 999_992, startedAt: now - 10_000, now: now - 10_000 })
    atomicWriteState(
      root,
      oldToken,
      ownedState(root, oldToken, { launcherPid: 999_992, launcherStartedAt: now - 10_000 }),
    )
    const teardown = spawn(process.execPath, [worker, 'teardown', root, oldToken, gate], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    await waitUntil(() => readFileSafely(`${gate}.held`) === oldToken)
    const next = spawn(process.execPath, [worker, 'takeover', root], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    await new Promise((resolve) => setTimeout(resolve, 150))
    assert.equal(next.exitCode, null)
    writeFileSync(gate, 'release')
    const [teardownResult, nextResult] = await Promise.all([
      collectJson(teardown),
      collectJson(next),
    ])
    assert.equal(teardownResult.ok, true)
    assert.equal(nextResult.ok, true)
    assert.notEqual(nextResult.runToken, oldToken)
    assert.equal(
      JSON.parse(readFileSync(`${stateFile(root)}.lock`, 'utf8')).runToken,
      nextResult.runToken,
    )
  } finally {
    releaseRunLock(root, oldToken)
    try {
      const current = JSON.parse(readFileSync(`${stateFile(root)}.lock`, 'utf8'))
      releaseRunLock(root, current.runToken)
    } catch {
      /* no current owner */
    }
    rmSync(root, { recursive: true, force: true })
  }
})

test('owner 硬崩溃后原子接管并回收其构建阶段状态', async () => {
  const root = mkdtempSync(join(tmpdir(), 'garment-e2e-recover-'))
  const oldToken = createRunToken()
  const nextToken = createRunToken()
  const now = Date.now()
  const activeChild = {
    pid: 202,
    startedAt: now,
    marker: `garment.e2e.run-token=${oldToken}`,
    stage: 'build',
  }
  const recovered = []
  const inspect = (pid) =>
    pid === 202
      ? {
          pid,
          parentPid: 101,
          commandLine: `mvn -Dgarment.e2e.run-token=${oldToken} package`,
          startedAt: now,
          executable: 'test-maven',
        }
      : undefined
  try {
    acquireRunLock(root, oldToken, { pid: 101, startedAt: now, now })
    atomicWriteState(
      root,
      oldToken,
      ownedState(root, oldToken, { launcherStartedAt: now, activeChild }),
    )
    const result = await acquireOrRecoverRunLock(root, nextToken, {
      inspect,
      now,
      owner: { pid: 303, startedAt: now, now },
      recover: async (_project, state) => recovered.push(state.activeChild.pid),
    })
    assert.deepEqual(result, { recovered: true, previousToken: oldToken })
    assert.deepEqual(recovered, [202])
  } finally {
    releaseRunLock(root, nextToken)
    releaseRunLock(root, oldToken)
    rmSync(root, { recursive: true, force: true })
  }
})

test('并发接管陈旧锁只有一个胜者', async () => {
  const root = mkdtempSync(join(tmpdir(), 'garment-e2e-race-'))
  const oldToken = createRunToken()
  const firstToken = createRunToken()
  const secondToken = createRunToken()
  const now = Date.now()
  const identities = new Map([
    [301, { pid: 301, parentPid: 1, commandLine: 'node e2e-web-server.mjs', startedAt: now }],
    [302, { pid: 302, parentPid: 1, commandLine: 'node e2e-web-server.mjs', startedAt: now }],
  ])
  const inspect = (pid) => identities.get(pid)
  try {
    acquireRunLock(root, oldToken, { pid: 101, startedAt: now, now })
    atomicWriteState(root, oldToken, ownedState(root, oldToken, { launcherStartedAt: now }))
    const results = await Promise.allSettled([
      acquireOrRecoverRunLock(root, firstToken, {
        inspect,
        now,
        owner: { pid: 301, startedAt: now, now },
        recover: async () => new Promise((resolve) => setTimeout(resolve, 20)),
      }),
      acquireOrRecoverRunLock(root, secondToken, {
        inspect,
        now,
        owner: { pid: 302, startedAt: now, now },
        recover: async () => {},
      }),
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1)
  } finally {
    releaseRunLock(root, firstToken)
    releaseRunLock(root, secondToken)
    releaseRunLock(root, oldToken)
    rmSync(root, { recursive: true, force: true })
  }
})

test('macOS 通过 ps 读取当前进程归属信息', { skip: process.platform !== 'darwin' }, async () => {
  const current = await import('./e2e-launcher.mjs')
  const inspected = current.inspectProcess(process.pid, 'darwin')
  assert.equal(inspected?.pid, process.pid)
  assert.ok(inspected?.parentPid > 0)
  assert.ok(inspected?.processGroupId > 0)
  assert.equal(inspected?.sessionId, null)
  assert.ok(inspected?.commandLine.includes('node'))
  assert.ok(Number.isFinite(inspected?.startedAt))
})

test('篡改或 PID 复用的陈旧状态拒绝回收并恢复旧锁', async () => {
  for (const scenario of ['tampered', 'pid-reuse']) {
    const root = mkdtempSync(join(tmpdir(), `garment-e2e-${scenario}-`))
    const oldToken = createRunToken()
    const nextToken = createRunToken()
    const now = Date.now()
    let recovered = false
    try {
      acquireRunLock(root, oldToken, { pid: 101, startedAt: now - 10_000, now })
      const state = ownedState(root, oldToken, { launcherStartedAt: now - 10_000 })
      atomicWriteState(
        root,
        oldToken,
        scenario === 'tampered' ? { ...state, unexpected: true } : state,
      )
      const inspect =
        scenario === 'pid-reuse'
          ? () => ({
              pid: 101,
              parentPid: 1,
              commandLine: 'node unrelated.mjs',
              startedAt: now,
            })
          : () => undefined
      await assert.rejects(
        acquireOrRecoverRunLock(root, nextToken, {
          inspect,
          now,
          owner: { pid: 303, startedAt: now, now },
          recover: async () => (recovered = true),
        }),
        /拒绝接管/,
      )
      assert.equal(recovered, false)
      assert.equal(readFileSafely(`${stateFile(root)}.lock`).includes(oldToken), true)
    } finally {
      releaseRunLock(root, nextToken)
      releaseRunLock(root, oldToken)
      rmSync(root, { recursive: true, force: true })
    }
  }
})

for (const stage of ['compose', 'build', 'backend']) {
  test(`${stage} 阶段 launcher 被硬杀后真实子进程可由下一 run 回收`, async () => {
    const root = mkdtempSync(join(tmpdir(), `garment-e2e-hard-crash-${stage}-`))
    const fixture = fileURLToPath(new URL('./fixtures/fake-e2e-web-server.mjs', import.meta.url))
    const launcher = spawn(process.execPath, [fixture, root, stage], {
      detached: true,
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    let childPid
    let nextToken
    try {
      const ready = await readLine(launcher.stdout)
      childPid = JSON.parse(ready).childPid
      assert.ok(isAlive(childPid))
      hardKillSingleProcess(launcher.pid)
      await waitUntil(() => !isAlive(launcher.pid))

      nextToken = createRunToken()
      const current = await import('./e2e-launcher.mjs')
      const ownerStartedAt = current.inspectProcess(process.pid)?.startedAt ?? Date.now()
      const claimed = await acquireOrRecoverRunLock(root, nextToken, {
        owner: { pid: process.pid, startedAt: ownerStartedAt },
      })
      assert.equal(claimed.recovered, true)
      await waitUntil(() => !isAlive(childPid))
      assert.equal(isAlive(childPid), false)
    } finally {
      if (isAlive(launcher.pid)) hardKillSingleProcess(launcher.pid)
      if (childPid && isAlive(childPid)) await terminatePid(childPid)
      if (nextToken) releaseRunLock(root, nextToken)
      rmSync(root, { recursive: true, force: true })
    }
  })
}

test(
  'POSIX 终止独立进程组会回收子孙且不误杀外部进程',
  { skip: process.platform === 'win32' },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'garment-e2e-tree-'))
    const marker = join(root, 'grandchild.pid')
    const external = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: true,
    })
    const tree = spawn(
      process.execPath,
      [
        '-e',
        `const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)']);writeFileSync(${JSON.stringify(marker)},String(c.pid));setInterval(()=>{},1000)`,
      ],
      { detached: true },
    )
    try {
      for (let attempt = 0; attempt < 50 && !readFileSafely(marker); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      const grandchildPid = Number(readFileSafely(marker))
      await terminatePid(tree.pid, 'linux', { graceMs: 500 })
      assert.equal(isAlive(tree.pid), false)
      assert.equal(isAlive(grandchildPid), false)
      assert.equal(isAlive(external.pid), true)
    } finally {
      if (isAlive(external.pid)) process.kill(-external.pid, 'SIGKILL')
      rmSync(root, { recursive: true, force: true })
    }
  },
)

function readFileSafely(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function ownedState(root, token, overrides = {}) {
  const launcherStartedAt = overrides.launcherStartedAt ?? Date.now()
  const activeChild = overrides.activeChild
    ? {
        ...overrides.activeChild,
        processGroupId: overrides.activeChild.processGroupId ?? null,
        sessionId: overrides.activeChild.sessionId ?? null,
        startedAt: new Date(overrides.activeChild.startedAt).toISOString(),
        executable: overrides.activeChild.executable ?? 'test-maven',
      }
    : null
  const backendPid = overrides.backendPid ?? null
  const backendStartedAt = overrides.backendStartedAt ?? null
  const backendResource =
    backendPid === null
      ? null
      : {
          pid: backendPid,
          processGroupId: null,
          sessionId: null,
          startedAt: new Date(backendStartedAt).toISOString(),
          marker: `garment.e2e.run-token=${token}`,
          executable: 'test-java',
          stage: 'backend',
        }
  return {
    version: stateVersion,
    projectIdentity: projectIdentity(root),
    runToken: token,
    launcherPid: overrides.launcherPid ?? 101,
    launcherStartedAt: new Date(launcherStartedAt).toISOString(),
    backendPid,
    backendStartedAt: backendStartedAt === null ? null : new Date(backendStartedAt).toISOString(),
    backendResource,
    activeChild,
    composeCleanup: overrides.composeCleanup ?? cleanupPlan(launcher.composeProjectName(token)),
    dependencyPorts:
      overrides.dependencyPorts ??
      (backendPid === null
        ? null
        : { mysql: 49101, redis: 49102, minio: 49103, minioConsole: 49104 }),
  }
}

function collectJson(child) {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.once('error', reject)
    child.once('exit', () => {
      try {
        resolve(JSON.parse(stdout.trim()))
      } catch (error) {
        reject(new Error(`worker 未返回 JSON：${stderr || stdout}`, { cause: error }))
      }
    })
  })
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve)
  })
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server.listening) resolve()
    else server.close(resolve)
  })
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function hardKillSingleProcess(pid) {
  if (process.platform === 'win32')
    spawnSync('taskkill.exe', ['/pid', String(pid), '/F'], { stdio: 'ignore' })
  else process.kill(pid, 'SIGKILL')
}

function readLine(stream) {
  return new Promise((resolve, reject) => {
    let buffered = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      buffered += chunk
      const newline = buffered.indexOf('\n')
      if (newline >= 0) resolve(buffered.slice(0, newline))
    })
    stream.once('error', reject)
    stream.once('end', () => reject(new Error('fixture 在 ready 前退出。')))
  })
}

async function waitUntil(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('等待进程状态变化超时。')
}
