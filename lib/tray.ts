import { spawn, type ChildProcess } from 'node:child_process'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

let child: ChildProcess | null = null
let shown = ''

const source = `import Cocoa

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
item.button?.title = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "gitbackup"

final class Actions: NSObject {
  @objc func openSite() {
    if let url = URL(string: "http://127.0.0.1:3000") {
      NSWorkspace.shared.open(url)
    }
  }
  @objc func hide() { app.terminate(nil) }
}

let actions = Actions()
let menu = NSMenu()
let openItem = NSMenuItem(title: "Open gitbackup", action: #selector(Actions.openSite), keyEquivalent: "o")
openItem.target = actions
menu.addItem(openItem)
let hideItem = NSMenuItem(title: "Hide icon", action: #selector(Actions.hide), keyEquivalent: "h")
hideItem.target = actions
menu.addItem(hideItem)
item.menu = menu
app.run()
`

// null hides the icon.
export async function updateTray(label: string | null): Promise<void> {
  if (process.platform !== 'darwin' || process.env.VERCEL) return
  if (child && shown === label && child.exitCode === null) return
  shown = label ?? ''
  const dir = join(homedir(), '.cache', 'gitbackup')
  const bin = join(dir, 'menu-bar')
  await mkdir(dir, { recursive: true })
  await stopPrevious(join(dir, 'menu-bar.pid'))
  if (label === null) return
  try {
    await access(bin)
  } catch {
    try {
      await compile(bin, join(dir, 'menu-bar.swift'))
    } catch {
      return
    }
  }
  // Same process group as the app, so closing the terminal also removes the icon instead of leaving a stale time.
  child = spawn(bin, [label], { stdio: 'ignore' })
  child.unref()
  if (child.pid) await writeFile(join(dir, 'menu-bar.pid'), String(child.pid))
}

async function compile(bin: string, file: string): Promise<void> {
  await writeFile(file, source)
  await new Promise<void>((resolve, reject) => {
    const compiler = spawn('swiftc', ['-O', '-o', bin, file])
    compiler.on('error', reject)
    compiler.on('close', (code) => code === 0 ? resolve() : reject(new Error('menu bar compile failed')))
  })
}

async function stopPrevious(pidFile: string): Promise<void> {
  child?.kill()
  child = null
  const text = await readFile(pidFile, 'utf8').catch(() => '')
  const pid = Number(text)
  if (pid > 0) {
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
  }
  await rm(pidFile, { force: true })
}
