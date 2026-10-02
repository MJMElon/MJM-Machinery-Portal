// Tiny local asserts (no network imports needed to run the tests).
function assert(cond: unknown, msg = 'assertion failed'): asserts cond {
  if (!cond) throw new Error(msg)
}
function assertEquals(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a !== e) throw new Error(`expected ${e}, got ${a}`)
}
import {
  buildStoragePath,
  findCaseNumber,
  handle,
  hmacHex,
  parseAllowlist,
  parseReport,
  type CaseRef,
  type Config,
  type Deps,
  type MessageRow,
  type NewCase,
  type Store,
} from './handler.ts'

const SECRET = 'test-app-secret'
const PNID = '111222333'
const ME = '60123456789'

const config = (over: Partial<Config> = {}): Config => ({
  verifyToken: 'verify-me',
  appSecret: SECRET,
  accessToken: 'test-token',
  phoneNumberId: PNID,
  allowedNumbers: parseAllowlist(`+60 12-345 6789, 60198765432`),
  graphVersion: 'v23.0',
  maxBytes: 1024,
  ...over,
})

class MemStore implements Store {
  rows = new Map<string, MessageRow & Record<string, unknown>>()
  uploads = new Map<string, Uint8Array>()
  failInsert = false
  async insertIfNew(row: MessageRow) {
    if (this.failInsert) throw new Error('db down')
    if (this.rows.has(row.wa_message_id)) return false
    this.rows.set(row.wa_message_id, { ...row, attempts: 0 })
    return true
  }
  async claim(id: string) {
    const r = this.rows.get(id)
    if (!r || !['received', 'failed'].includes(r.status) || (r.attempts ?? 0) >= 5) return null
    r.status = 'processing'
    return { ...r }
  }
  async update(id: string, patch: Record<string, unknown>) {
    Object.assign(this.rows.get(id)!, patch)
  }
  async upload(path: string, bytes: Uint8Array) {
    this.uploads.set(path, bytes)
  }
  cases = new Map<string, NewCase & CaseRef & { status: string; ack_message_id: string | null }>()
  private ref = (c: CaseRef | undefined) => (c ? { id: c.id, case_no: c.case_no } : null)
  async findCaseByNo(n: number) {
    return this.ref([...this.cases.values()].find((c) => c.case_no === n))
  }
  async findCaseByReply(id: string) {
    const c = [...this.cases.values()].find((c) => c.ack_message_id === id)
    if (c) return this.ref(c)
    const m = [...this.rows.values()].find((r) => (r.wa_message_id === id || r.ack_message_id === id) && r.case_id)
    return m ? this.ref(this.cases.get(m.case_id as string)) : null
  }
  async recentCaseForSender(from: string, since: string) {
    const m = [...this.rows.values()]
      .filter((r) => r.wa_from === from && r.case_id && r.received_at >= since)
      .filter((r) => this.cases.get(r.case_id as string)?.status === 'pending')
      .sort((a, b) => b.received_at.localeCompare(a.received_at))[0]
    return m ? this.ref(this.cases.get(m.case_id as string)) : null
  }
  async createCase(c: NewCase) {
    const case_no = this.cases.size + 1
    const row = { ...c, id: `case-${case_no}`, case_no, status: 'pending', ack_message_id: null }
    this.cases.set(row.id, row)
    return { id: row.id, case_no }
  }
  async setCaseAck(id: string, ack: string | null) {
    this.cases.get(id)!.ack_message_id = ack
  }
}

type Route = (url: string, init?: RequestInit) => Response
function fakeFetch(routes: { media?: Route; file?: Route; send?: Route }) {
  const calls: string[] = []
  let acks = 0
  const f = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.includes('/messages')) {
      return (routes.send ?? (() => Response.json({ messages: [{ id: `wamid.ACK${++acks}` }] })))(url, init)
    }
    if (url.startsWith('https://lookaside.example/')) return (routes.file ?? (() => new Response(new Uint8Array([1, 2, 3]))))(url, init)
    if (url.includes('graph.facebook.com')) {
      return (routes.media ??
        (() => Response.json({ url: 'https://lookaside.example/img', mime_type: 'image/jpeg', file_size: 3 })))(url, init)
    }
    return new Response('not found', { status: 404 })
  }
  return { fetch: f as typeof fetch, calls }
}

function deps(store: MemStore, f: ReturnType<typeof fakeFetch>, over: Partial<Config> = {}) {
  const pending: Promise<unknown>[] = []
  const d: Deps = { config: config(over), store, fetch: f.fetch, waitUntil: (p) => pending.push(p) }
  return { d, flush: () => Promise.all(pending) }
}

function payload(messages: unknown[], pnid = PNID) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550000000', phone_number_id: pnid },
              contacts: [{ wa_id: ME, profile: { name: 'Elon' } }],
              messages,
            },
          },
        ],
      },
    ],
  }
}

const image = (id = 'wamid.IMG1', from = ME) => ({
  from,
  id,
  timestamp: '1790000000',
  type: 'image',
  image: { id: 'MEDIA1', mime_type: 'image/jpeg', sha256: 'x', caption: 'Excavator 3 meter' },
})

async function signedPost(body: unknown, secret = SECRET) {
  const raw = new TextEncoder().encode(JSON.stringify(body))
  return new Request('https://x.supabase.co/functions/v1/whatsapp-webhook', {
    method: 'POST',
    headers: { 'x-hub-signature-256': `sha256=${await hmacHex(secret, raw)}`, 'content-type': 'application/json' },
    body: raw,
  })
}

Deno.test('GET verification returns challenge only with the right token', async () => {
  const { d } = deps(new MemStore(), fakeFetch({}))
  const ok = await handle(new Request('https://x/?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345'), d)
  assertEquals(ok.status, 200)
  assertEquals(await ok.text(), '12345')
  const bad = await handle(new Request('https://x/?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345'), d)
  assertEquals(bad.status, 403)
})

Deno.test('POST with missing or wrong signature is rejected and nothing is stored', async () => {
  const store = new MemStore()
  const { d } = deps(store, fakeFetch({}))
  const noSig = await handle(new Request('https://x/', { method: 'POST', body: JSON.stringify(payload([image()])) }), d)
  assertEquals(noSig.status, 401)
  const wrong = await handle(await signedPost(payload([image()]), 'other-secret'), d)
  assertEquals(wrong.status, 401)
  assertEquals(store.rows.size, 0)
})

Deno.test('image from allowlisted sender: saved to storage, put in a new case, reply sent', async () => {
  const store = new MemStore()
  const f = fakeFetch({})
  const { d, flush } = deps(store, f)
  const res = await handle(await signedPost(payload([image()])), d)
  assertEquals(res.status, 200)
  await flush()
  const r = store.rows.get('wamid.IMG1')!
  assertEquals(r.status, 'saved')
  assertEquals(r.caption, 'Excavator 3 meter')
  assertEquals(r.sender_name, 'Elon')
  assertEquals(r.ack_status, 'sent')
  assertEquals(r.ack_message_id, 'wamid.ACK1')
  assertEquals(r.case_id, 'case-1')
  assertEquals(store.cases.get('case-1')!.ack_message_id, 'wamid.ACK1')
  assert(String(r.storage_path).endsWith('/wamid_IMG1.jpg'))
  assertEquals(store.uploads.size, 1)
  const send = f.calls.find((c) => c.includes(`/${PNID}/messages`))
  assert(send?.startsWith('POST'), 'reply was sent')
})

Deno.test('duplicate delivery does not download or reply twice', async () => {
  const store = new MemStore()
  const f = fakeFetch({})
  const { d, flush } = deps(store, f)
  await handle(await signedPost(payload([image()])), d)
  await flush()
  const r2 = await handle(await signedPost(payload([image()])), d)
  assertEquals(r2.status, 200)
  await flush()
  assertEquals(f.calls.filter((c) => c.includes('/messages')).length, 1)
  assertEquals(f.calls.filter((c) => c.includes('lookaside')).length, 1)
  assertEquals(store.rows.size, 1)
})

const text = (id: string, body: string, ts = 1790000000, from = ME, context?: { id: string }) => ({
  from,
  id,
  timestamp: String(ts),
  type: 'text',
  text: { body },
  ...(context ? { context } : {}),
})
const photo = (id: string, ts: number, caption?: string) => ({
  from: ME,
  id,
  timestamp: String(ts),
  type: 'image',
  image: { id: 'MEDIA-' + id, mime_type: 'image/jpeg', ...(caption ? { caption } : {}) },
})
function replies() {
  const bodies: string[] = []
  const f = fakeFetch({
    send: (_u, init) => {
      bodies.push(JSON.parse(String(init?.body)).text.body)
      return Response.json({ messages: [{ id: `wamid.ACK${bodies.length}` }] })
    },
  })
  return { f, bodies }
}

Deno.test('new text report opens a case with machine + problem, replies with the case number', async () => {
  const store = new MemStore()
  const { f, bodies } = replies()
  const { d, flush } = deps(store, f)
  const res = await handle(await signedPost(payload([text('wamid.T1', 'EX-03 hydraulic leak at boom')])), d)
  assertEquals(res.status, 200)
  await flush()
  const r = store.rows.get('wamid.T1')!
  assertEquals(r.status, 'saved')
  assertEquals(r.caption, 'EX-03 hydraulic leak at boom')
  assertEquals(r.case_id, 'case-1')
  const c = store.cases.get('case-1')!
  assertEquals([c.machine_name, c.problem, c.wa_from, c.ack_message_id], ['EX-03', 'hydraulic leak at boom', ME, 'wamid.ACK1'])
  assert(bodies[0].startsWith('✅ Case #1 created'), bodies[0])
  assert(bodies[0].includes('Machine: EX-03') && bodies[0].includes('write #1'), bodies[0])
  assertEquals(store.uploads.size, 0)

  // A redelivery of the same text does not open another case or reply twice.
  await handle(await signedPost(payload([text('wamid.T1', 'EX-03 hydraulic leak at boom')])), d)
  await flush()
  assertEquals([store.cases.size, bodies.length], [1, 1])
})

Deno.test('follow-ups join the case: captionless photo, #number, and WhatsApp reply', async () => {
  const store = new MemStore()
  const { f, bodies } = replies()
  const { d, flush } = deps(store, f)
  const t0 = 1790000000
  await handle(await signedPost(payload([text('wamid.T1', 'EX-03 hydraulic leak'), photo('wamid.P1', t0 + 60)])), d)
  await flush()
  assertEquals(store.rows.get('wamid.P1')!.case_id, 'case-1')
  assertEquals(bodies[1], '📷 Photo added to case #1')

  // Another allowed number writes the case number.
  await handle(await signedPost(payload([text('wamid.T2', 'mechanic on the way for #1', t0 + 120, '60198765432')])), d)
  await flush()
  assertEquals(store.rows.get('wamid.T2')!.case_id, 'case-1')
  assertEquals(bodies[2], '📝 Update added to case #1')

  // Replying (WhatsApp "reply") to our "Case #1 created" message.
  await handle(await signedPost(payload([text('wamid.T3', 'fixed now', t0 + 7200, ME, { id: 'wamid.ACK1' })])), d)
  await flush()
  assertEquals(store.rows.get('wamid.T3')!.case_id, 'case-1')

  // A photo with its own caption (no number) is a new report → new case.
  await handle(await signedPost(payload([photo('wamid.P2', t0 + 7300, 'TR-11 flat tyre')])), d)
  await flush()
  assertEquals(store.rows.get('wamid.P2')!.case_id, 'case-2')
  assertEquals(store.cases.get('case-2')!.machine_name, 'TR-11')
  assertEquals(store.cases.size, 2)
})

Deno.test('captionless photo long after the last report opens a new case', async () => {
  const store = new MemStore()
  const { f } = replies()
  const { d, flush } = deps(store, f)
  await handle(await signedPost(payload([text('wamid.T1', 'EX-03 leak'), photo('wamid.P1', 1790000000 + 3600)])), d)
  await flush()
  assertEquals(store.rows.get('wamid.P1')!.case_id, 'case-2')
})

Deno.test('cases unavailable (migration not run): message still saved and acknowledged', async () => {
  const store = new MemStore()
  store.createCase = () => Promise.reject(new Error('relation "machinery_cases" does not exist'))
  const { f, bodies } = replies()
  const { d, flush } = deps(store, f)
  await handle(await signedPost(payload([text('wamid.T1', 'EX-03 leak')])), d)
  await flush()
  const r = store.rows.get('wamid.T1')!
  assertEquals([r.status, r.case_id ?? null, bodies[0]], ['saved', null, 'Received ✅'])
})

Deno.test('case number and report parsing', () => {
  assertEquals(findCaseNumber('see #12 please'), 12)
  assertEquals(findCaseNumber('Case no: 7 done'), 7)
  assertEquals(findCaseNumber('MR-305'), 305)
  assertEquals(findCaseNumber('EX-03 leak'), null)
  assertEquals(parseReport('EX-03 hydraulic leak'), { machine: 'EX-03', problem: 'hydraulic leak' })
  assertEquals(parseReport('tr 11 - flat tyre'), { machine: 'TR-11', problem: 'flat tyre' })
  assertEquals(parseReport('Machine: Excavator 3\nProblem: no power'), { machine: 'Excavator 3', problem: 'no power' })
  assertEquals(parseReport('Mesin: Lori WXY1234\nbrek bunyi'), { machine: 'Lori WXY1234', problem: 'brek bunyi' })
  assertEquals(parseReport('generator at block C not starting'), {
    machine: null,
    problem: 'generator at block C not starting',
  })
  assertEquals(parseReport(''), { machine: null, problem: null })
})

Deno.test('unsupported type and non-allowlisted sender are logged, not processed, no reply', async () => {
  const store = new MemStore()
  const f = fakeFetch({})
  const { d, flush } = deps(store, f)
  const video = { from: ME, id: 'wamid.VID', timestamp: '1790000000', type: 'video', video: { id: 'MEDIA2' } }
  const strangerText = { from: '60111111111', id: 'wamid.STRTXT', timestamp: '1790000000', type: 'text', text: { body: 'hi' } }
  const res = await handle(await signedPost(payload([video, image('wamid.STRANGER', '60111111111'), strangerText])), d)
  assertEquals(res.status, 200)
  await flush()
  assertEquals(store.rows.get('wamid.VID')!.status, 'ignored')
  assertEquals(store.rows.get('wamid.VID')!.message_type, 'video')
  assertEquals(store.rows.get('wamid.STRANGER')!.status, 'ignored')
  assertEquals(store.rows.get('wamid.STRTXT')!.status, 'ignored')
  assertEquals(f.calls.length, 0)
})

Deno.test('expired token: record marked failed with a clear error, no reply', async () => {
  const store = new MemStore()
  const f = fakeFetch({
    media: () =>
      Response.json({ error: { message: 'Error validating access token: Session has expired', code: 190 } }, { status: 401 }),
  })
  const { d, flush } = deps(store, f)
  await handle(await signedPost(payload([image()])), d)
  await flush()
  const r = store.rows.get('wamid.IMG1')!
  assertEquals(r.status, 'failed')
  assert(String(r.error_details).includes('WHATSAPP_ACCESS_TOKEN'))
  assertEquals(f.calls.filter((c) => c.includes('/messages')).length, 0)
})

Deno.test('failed save is retried on the next delivery of the same message', async () => {
  const store = new MemStore()
  let fail = true
  const f = fakeFetch({ file: () => (fail ? new Response('boom', { status: 500 }) : new Response(new Uint8Array([9]))) })
  const { d, flush } = deps(store, f)
  await handle(await signedPost(payload([image()])), d)
  await flush()
  assertEquals(store.rows.get('wamid.IMG1')!.status, 'failed')
  fail = false
  await handle(await signedPost(payload([image()])), d)
  await flush()
  assertEquals(store.rows.get('wamid.IMG1')!.status, 'saved')
  assertEquals(store.rows.get('wamid.IMG1')!.attempts, 2)
})

Deno.test('reply failure keeps the photo saved and logs the error', async () => {
  const store = new MemStore()
  const f = fakeFetch({
    send: () =>
      Response.json({ error: { message: 'Recipient phone number not in allowed list', code: 131030 } }, { status: 400 }),
  })
  const { d, flush } = deps(store, f)
  await handle(await signedPost(payload([image()])), d)
  await flush()
  const r = store.rows.get('wamid.IMG1')!
  assertEquals(r.status, 'saved')
  assertEquals(r.ack_status, 'failed')
  assert(String(r.ack_error).includes('131030'))
})

Deno.test('DB outage returns 500 so Meta retries', async () => {
  const store = new MemStore()
  store.failInsert = true
  const { d } = deps(store, fakeFetch({}))
  const res = await handle(await signedPost(payload([image()])), d)
  assertEquals(res.status, 500)
})

Deno.test('oversized image is refused', async () => {
  const store = new MemStore()
  const f = fakeFetch({ media: () => Response.json({ url: 'https://lookaside.example/img', mime_type: 'image/jpeg', file_size: 999999 }) })
  const { d, flush } = deps(store, f)
  await handle(await signedPost(payload([image()])), d)
  await flush()
  assertEquals(store.rows.get('wamid.IMG1')!.status, 'failed')
})

Deno.test('message for another phone number id is ignored entirely', async () => {
  const store = new MemStore()
  const { d } = deps(store, fakeFetch({}))
  const res = await handle(await signedPost(payload([image()], '999')), d)
  assertEquals(res.status, 200)
  assertEquals(store.rows.size, 0)
})

Deno.test('storage path is safe and dated', () => {
  assertEquals(buildStoragePath('wamid.HBg=/../x', '2026-09-29T03:00:00Z', 'image/png'), '2026/09/wamid_HBg_____x.png')
})
