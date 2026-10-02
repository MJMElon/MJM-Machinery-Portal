// Tiny local asserts (no network imports needed to run the tests).
function assert(cond: unknown, msg = 'assertion failed'): asserts cond {
  if (!cond) throw new Error(msg)
}
function assertEquals(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a !== e) throw new Error(`expected ${e}, got ${a}`)
}
import { buildStoragePath, handle, hmacHex, parseAllowlist, type Config, type Deps, type MessageRow, type Store } from './handler.ts'

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
  ackText: 'Photo received',
  ackTextMessage: 'Message received',
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
}

type Route = (url: string, init?: RequestInit) => Response
function fakeFetch(routes: { media?: Route; file?: Route; send?: Route }) {
  const calls: string[] = []
  const f = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.includes('/messages')) return (routes.send ?? (() => Response.json({ messages: [{ id: 'wamid.ACK' }] })))(url, init)
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

Deno.test('image from allowlisted sender: saved to storage, then "Photo received" sent', async () => {
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
  assertEquals(r.ack_message_id, 'wamid.ACK')
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

Deno.test('text message from allowlisted sender: saved with its body, then "Message received" sent', async () => {
  const store = new MemStore()
  const f = fakeFetch({})
  const { d, flush } = deps(store, f)
  const text = { from: ME, id: 'wamid.TXT', timestamp: '1790000000', type: 'text', text: { body: 'Excavator 3 hydraulic leak' } }
  const res = await handle(await signedPost(payload([text])), d)
  assertEquals(res.status, 200)
  await flush()
  const r = store.rows.get('wamid.TXT')!
  assertEquals(r.status, 'saved')
  assertEquals(r.message_type, 'text')
  assertEquals(r.caption, 'Excavator 3 hydraulic leak')
  assertEquals(r.ack_status, 'sent')
  assertEquals(store.uploads.size, 0)
  assertEquals(f.calls.length, 1)
  const send = f.calls[0]
  assert(send.startsWith('POST') && send.includes(`/${PNID}/messages`), 'reply was sent')

  // A redelivery of the same text is not replied to twice.
  await handle(await signedPost(payload([text])), d)
  await flush()
  assertEquals(f.calls.length, 1)
})

Deno.test('reply text differs for photos and text messages', async () => {
  const store = new MemStore()
  const bodies: string[] = []
  const f = fakeFetch({
    send: (_u, init) => {
      bodies.push(JSON.parse(String(init?.body)).text.body)
      return Response.json({ messages: [{ id: 'wamid.ACK' }] })
    },
  })
  const { d, flush } = deps(store, f, { ackTextMessage: 'Message received' })
  const text = { from: ME, id: 'wamid.TXT', timestamp: '1790000000', type: 'text', text: { body: 'hi' } }
  await handle(await signedPost(payload([image(), text])), d)
  await flush()
  assertEquals(bodies.sort(), ['Message received', 'Photo received'])
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
