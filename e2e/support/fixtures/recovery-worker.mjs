import { appendFileSync, existsSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import {
  acquireOrRecoverRunLock,
  createRunToken,
  inspectProcess,
  recoverRunByToken,
  withRecoveryLease,
} from '../e2e-launcher.mjs'

const [mode, projectDirectory, argument, gate] = process.argv.slice(2)
const runToken = createRunToken()
const ownerStartedAt = inspectProcess(process.pid)?.startedAt ?? Date.now()

try {
  if (mode === 'hold-lease') {
    await withRecoveryLease(projectDirectory, runToken, async () => {
      writeFileSync(`${argument}.held`, 'held')
      await new Promise(() => {})
    })
  } else if (mode === 'takeover') {
    let enteredDestructive = false
    const result = await acquireOrRecoverRunLock(projectDirectory, runToken, {
      owner: { pid: process.pid, startedAt: ownerStartedAt },
      recover: async () => {
        enteredDestructive = true
        appendFileSync(argument, `${runToken}\n`)
        await delay(200)
      },
    })
    process.stdout.write(
      JSON.stringify({ ok: true, runToken, enteredDestructive, recovered: result.recovered }),
    )
    await delay(3000)
  } else if (mode === 'teardown') {
    const recovered = await recoverRunByToken(projectDirectory, argument, {
      recover: async () => {
        writeFileSync(`${gate}.held`, argument)
        while (!existsSync(gate)) await delay(20)
      },
    })
    process.stdout.write(JSON.stringify({ ok: recovered }))
  } else if (mode === 'fallback') {
    const recovered = await recoverRunByToken(projectDirectory, argument, {
      recover: async () => appendFileSync(gate, 'fallback\n'),
    })
    process.stdout.write(JSON.stringify({ ok: true, recovered }))
  } else {
    throw new Error(`未知 worker mode：${mode}`)
  }
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, runToken, error: error.message }))
}
