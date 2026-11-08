import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isLocalHost, localOnly } from '../lib/local-request.ts'

test('only this computer can run the backup pages', () => {
  assert.equal(isLocalHost('localhost:3000'), true)
  assert.equal(isLocalHost('127.0.0.1:3000'), true)
  assert.equal(isLocalHost('[::1]:3000'), true)
  assert.equal(isLocalHost('gitbackup.vercel.app'), false)
  assert.equal(isLocalHost('example.com:443'), false)
})

test('another website cannot change settings or start a backup', () => {
  const post = (origin?: string) => new Request('http://127.0.0.1:3000/api/backup', {
    method: 'POST',
    headers: { host: '127.0.0.1:3000', ...(origin ? { origin } : {}) },
  })
  assert.equal(localOnly(post('https://evil.example'))?.status, 403)
  assert.equal(localOnly(post('null'))?.status, 403)
  assert.equal(localOnly(post('http://127.0.0.1:3000')), null)
  assert.equal(localOnly(post('http://localhost:3000')), null)
  assert.equal(localOnly(post()), null)
})
