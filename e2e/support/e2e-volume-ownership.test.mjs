import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  cleanupCompose,
  cleanupPlan,
  composeArgs,
  composeProjectName,
  dependencyServices,
  runningComposeServices,
  dependencyComposeEnvironment,
  probeDependencyPorts,
  readDependencyPorts,
} from './e2e-launcher.mjs'

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const token = () => randomBytes(32).toString('hex')
const composeEnvironment = dependencyComposeEnvironment()

test('清理仅删除本轮唯一Compose项目及其卷，不影响另一项目', async () => {
  const ownedProject = composeProjectName(token())
  const foreignProject = composeProjectName(token())
  let ownedVolume
  let foreignVolume
  try {
    docker(composeArgs(ownedProject, 'up', '-d', '--wait', 'redis'))
    ownedVolume = projectVolume(ownedProject)
    assert.match(ownedVolume, /redis-data$/)
    docker(composeArgs(ownedProject, 'down'))

    docker(composeArgs(foreignProject, 'up', '-d', '--wait', 'redis'))
    foreignVolume = projectVolume(foreignProject)
    assert.match(foreignVolume, /redis-data$/)

    await cleanupCompose(projectDirectory, cleanupPlan(ownedProject))

    assert.equal(volumeExists(ownedVolume), false)
    assert.equal(volumeExists(foreignVolume), true)
    assert.deepEqual(runningComposeServices(projectDirectory, foreignProject), ['redis'])
  } finally {
    docker(composeArgs(ownedProject, 'down', '--volumes', '--remove-orphans'), false)
    docker(composeArgs(foreignProject, 'down', '--volumes', '--remove-orphans'), false)
  }
})

test('两个唯一Compose项目可用动态端口真实并行启动且数据与卷互相隔离', async (context) => {
  const firstProject = composeProjectName(token())
  const secondProject = composeProjectName(token())
  try {
    await Promise.all([
      dockerAsync(
        composeArgs(firstProject, 'up', '-d', '--wait', ...dependencyServices),
        composeEnvironment,
      ),
      dockerAsync(
        composeArgs(secondProject, 'up', '-d', '--wait', ...dependencyServices),
        composeEnvironment,
      ),
    ])
    const firstPorts = readDependencyPorts(projectDirectory, firstProject, composeEnvironment)
    const secondPorts = readDependencyPorts(projectDirectory, secondProject, composeEnvironment)
    context.diagnostic(
      `动态端口映射 ${JSON.stringify({ [firstProject]: firstPorts, [secondProject]: secondPorts })}`,
    )
    await Promise.all([probeDependencyPorts(firstPorts), probeDependencyPorts(secondPorts)])
    assert.equal(new Set([...Object.values(firstPorts), ...Object.values(secondPorts)]).size, 8)
    const firstVolumes = projectVolumes(firstProject)
    const secondVolumes = new Set(projectVolumes(secondProject))
    assert.deepEqual(
      firstVolumes.filter((volume) => secondVolumes.has(volume)),
      [],
    )
    redis(firstProject, 'SET', 'isolation-key', 'first')
    redis(secondProject, 'SET', 'isolation-key', 'second')
    assert.match(redis(firstProject, 'GET', 'isolation-key'), /first/)
    assert.match(redis(secondProject, 'GET', 'isolation-key'), /second/)

    docker(composeArgs(firstProject, 'down', '--volumes', '--remove-orphans'))

    assert.deepEqual(
      new Set(runningComposeServices(projectDirectory, secondProject)),
      new Set(dependencyServices),
    )
    assert.match(redis(secondProject, 'GET', 'isolation-key'), /second/)
  } finally {
    docker(composeArgs(firstProject, 'down', '--volumes', '--remove-orphans'), false)
    docker(composeArgs(secondProject, 'down', '--volumes', '--remove-orphans'), false)
  }
})

function projectVolume(projectName) {
  return docker([
    'volume',
    'ls',
    '--filter',
    `label=com.docker.compose.project=${projectName}`,
    '--filter',
    'label=com.docker.compose.volume=redis-data',
    '--format',
    '{{.Name}}',
  ]).trim()
}

function projectVolumes(projectName) {
  return docker([
    'volume',
    'ls',
    '--filter',
    `label=com.docker.compose.project=${projectName}`,
    '--format',
    '{{.Name}}',
  ])
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
}

function volumeExists(volume) {
  return docker(['volume', 'inspect', volume, '--format', '{{.Name}}'], false).trim() === volume
}

function docker(args, required = true) {
  const result = spawnSync('docker', args, {
    cwd: projectDirectory,
    env: { ...process.env, ...composeEnvironment },
    encoding: 'utf8',
    timeout: 120_000,
  })
  if (required) assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout || ''
}

function dockerAsync(args, environment) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('docker', args, {
      cwd: projectDirectory,
      env: { ...process.env, ...environment },
      encoding: 'utf8',
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0 ? resolvePromise(stdout) : reject(new Error(stderr || stdout)),
    )
  })
}

function redis(projectName, ...args) {
  return docker([
    ...composeArgs(projectName, 'exec', '-T', 'redis'),
    'redis-cli',
    '--no-auth-warning',
    '-a',
    composeEnvironment.REDIS_PASSWORD,
    ...args,
  ])
}
