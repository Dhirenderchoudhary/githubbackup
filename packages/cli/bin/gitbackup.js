#!/usr/bin/env node
import { existsSync } from 'node:fs'

// The npm package ships compiled dist/. A clone of the repository runs the TypeScript source.
const built = new URL('../dist/cli.js', import.meta.url)
const { run } = await import(existsSync(built) ? built.href : new URL('../src/cli.ts', import.meta.url).href)
run()
