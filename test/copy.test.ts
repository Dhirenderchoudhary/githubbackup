import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { destinationCopy, exampleRun, reportText, saved, stays } from '../lib/example.ts'
import { beats, groups, runSteps } from '../lib/flow.ts'

const root = dirname(fileURLToPath(import.meta.url))

test('the site tells a visitor how to save a repository', () => {
  const page = readFileSync(join(root, '../app/page.tsx'), 'utf8')
  const shell = readFileSync(join(root, '../components/shell.tsx'), 'utf8')
  const nav = readFileSync(join(root, '../components/nav.tsx'), 'utf8')
  const text = `${page}\n${shell}\n${nav}`
  assert.equal(text.includes('This site is a preview'), false)
  assert.equal(text.includes('sample data'), false)
  assert.match(page, /Save the repositories you created/)
  assert.match(page, /What gets saved/)
  assert.match(page, /Run it on your computer/)
  assert.match(nav, /from '@\/lib\/flow'/)
  assert.equal(beats.map((beat) => beat.label).join(' | '), 'Setup | Repositories | Backup | Schedule')
  assert.equal(groups.map((group) => group.id).join(','), 'owned,organization,starred,forked,collaborator')
  assert.equal(runSteps[1].command, 'cp .env.example .env')
  assert.match(runSteps[2].command, /npm run dev/)
  assert.equal(saved.map((item) => item.title).join(' | '), 'Your repositories | Your commits | Open-source pull requests | Merged pull requests')
  assert.equal(stays.includes('Issues, wikis, releases, and gists'), true)
  assert.equal(destinationCopy('drive').detail, 'One zip of the repositories in the run.')
  assert.equal(destinationCopy('s3').detail, 'Each repository as its own archive in your bucket.')
  assert.equal(destinationCopy('r2').detail, 'Each repository as its own archive in your bucket.')
  assert.equal(reportText(exampleRun('drive')).endsWith('destination drive\npublished'), true)
})
