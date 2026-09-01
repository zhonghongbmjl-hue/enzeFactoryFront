import { spawn } from 'node:child_process'
import { commandInvocation } from './e2e-launcher.mjs'

const [runMarker, command, ...args] = process.argv.slice(2)
if (!/^garment\.e2e\.run-token=[a-f0-9]{64}$/.test(runMarker) || !command) {
  process.stderr.write('E2E 子进程 wrapper 缺少有效 run token 或命令。\n')
  process.exit(2)
}

const invocation = commandInvocation(command, args)
const child = spawn(invocation.command, invocation.args, {
  stdio: 'inherit',
  shell: invocation.shell,
  windowsVerbatimArguments: invocation.windowsVerbatimArguments,
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal))
}
child.once('error', (error) => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exit(1)
})
child.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
