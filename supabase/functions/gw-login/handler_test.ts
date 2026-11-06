import { handle, type Deps } from './handler.ts'

function eq(a: unknown, b: unknown) {
  const x = JSON.stringify(a), y = JSON.stringify(b)
  if (x !== y) throw new Error(`expected ${y}, got ${x}`)
}

function setup(over: Partial<Deps> = {}) {
  const enrolled: unknown[] = []
  const deps: Deps = {
    checkAccess: async (t) =>
      t === 'good'
        ? { allowed: true, user: { id: 'gw1', email: 'Ali@MJM.local', full_name: ' Ali Driver ' } }
        : { allowed: false, error: 'invalid_token' },
    issueSession: async () => ({ userId: 'u1', tokenHash: 'hash1' }),
    enrol: async (...a) => void enrolled.push(a),
    ...over,
  }
  return { deps, enrolled }
}

const post = (body: unknown) =>
  new Request('https://x/gw-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

Deno.test('good token → session hash, user enrolled with lower-case e-mail and trimmed name', async () => {
  const { deps, enrolled } = setup()
  const res = await handle(post({ token: 'good' }), deps)
  eq(res.status, 200)
  eq(await res.json(), { token_hash: 'hash1', email: 'ali@mjm.local', full_name: 'Ali Driver' })
  eq(enrolled, [['u1', 'ali@mjm.local', 'Ali Driver']])
})

Deno.test('bad or used token → 403 with the gateway reason', async () => {
  const { deps, enrolled } = setup()
  const res = await handle(post({ token: 'bad' }), deps)
  eq(res.status, 403)
  eq((await res.json()).error, 'invalid_token')
  eq(enrolled.length, 0)
})

Deno.test('missing token → 400; wrong method → 405; OPTIONS → ok', async () => {
  const { deps } = setup()
  eq((await handle(post({}), deps)).status, 400)
  eq((await handle(new Request('https://x/gw-login'), deps)).status, 405)
  eq((await handle(new Request('https://x/gw-login', { method: 'OPTIONS' }), deps)).status, 200)
})

Deno.test('gateway down → 502; session failure → 500', async () => {
  const down = setup({ checkAccess: async () => { throw new Error('fetch failed') } })
  eq((await handle(post({ token: 'good' }), down.deps)).status, 502)
  const broken = setup({ issueSession: async () => { throw new Error('no magic link token') } })
  eq((await handle(post({ token: 'good' }), broken.deps)).status, 500)
})
