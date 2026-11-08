import { spawn } from 'node:child_process'
import { join } from 'node:path'

export function runGitbackup(args: string[], token: string, onLine: (line: string) => void): Promise<{ code: number, stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(process.cwd(), 'packages/cli/src/cli.ts'), ...args], {
      cwd: process.cwd(),
      env: { ...process.env, GITHUB_TOKEN: token },
    })
    let stderr = ''
    let pending = ''
    const take = (chunk: Buffer) => {
      pending += chunk.toString()
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) onLine(line)
    }
    child.stdout.on('data', take)
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (pending) onLine(pending)
      resolve({ code: code ?? 1, stderr })
    })
  })
}
