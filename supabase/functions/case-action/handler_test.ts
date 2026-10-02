import { handle, type ActionRow, type Deps } from './handler.ts'

function eq(a: unknown, b: unknown) {
  const x = JSON.stringify(a), y = JSON.stringify(b)
  if (x !== y) throw new Error(`expected ${y}, got ${x}`)
}

function setup(over: Partial<Deps> = {}) {
  const actions: ActionRow[] = []
  const patches: Record<string, unknown>[] = []
  const deps: Deps = {
    getUser: async (t) => (t === 'good' ? { id: 'u1', email: 'a@b.c' } : null),
    canEdit: async () => true,
    loadCase: async () => ({ id: 'k1', case_no: 7, machine_name: 'EX-03', supplier_id: null, sent_at: null }),
    loadSupplier: async () => ({ id: 's1', name: 'Ah Seng', phone: '+60 12-333 4444' }),
    insertAction: async (r) => actions.push(r),
    updateCase: async (_id, p) => void patches.push(p),
    send: async () => 'wamid.X',
    today: () => '2026-10-05',
    ...over,
  }
  return { deps, actions, patches }
}

const post = (body: unknown, token = 'good') =>
  new Request('https://x/case-action', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const ok = { case_id: 'k1', supplier_id: 's1', message: 'Please check hydraulic hose' }

Deno.test('sends, logs the action and sets supplier + sent-out date', async () => {
  const { deps, actions, patches } = setup()
  const res = await handle(post(ok), deps)
  eq(res.status, 200)
  eq(actions[0].delivery, 'sent')
  eq(actions[0].to_phone, '60123334444')
  eq(actions[0].wa_message_id, 'wamid.X')
  eq(patches, [{ supplier_id: 's1', sent_at: '2026-10-05' }])
})

Deno.test('failed send is logged with the reason and does not set sent-out date', async () => {
  const { deps, actions, patches } = setup({ send: () => Promise.reject(new Error('24 hours window closed')) })
  const res = await handle(post(ok), deps)
  eq(res.status, 502)
  eq(actions[0].delivery, 'failed')
  eq(actions[0].error, '24 hours window closed')
  eq(patches.length, 0)
})

Deno.test('no sign-in, no access, missing phone are refused without sending', async () => {
  let sent = 0
  const send = async () => (sent++, 'w')
  eq((await handle(post(ok, 'bad'), setup({ send }).deps)).status, 401)
  eq((await handle(post(ok), setup({ send, canEdit: async () => false }).deps)).status, 403)
  const noPhone = setup({ send, loadSupplier: async () => ({ id: 's1', name: 'X', phone: null }) })
  eq((await handle(post(ok), noPhone.deps)).status, 400)
  eq((await handle(post({ ...ok, message: '  ' }), setup({ send }).deps)).status, 400)
  eq(sent, 0)
})
