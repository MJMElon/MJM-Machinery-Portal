import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// Worker CMMS preferences, kept on the phone: language (English / Bahasa
// Melayu) and bright / dark mode. Text is written in English in the pages and
// looked up here: t('Send') gives 'Hantar' in Malay. {name} parts are filled
// from the second argument. What is saved to the database (problem, part,
// what was done) stays in English, so the office sees one language.

const MS = {
  // ---- header, start screen
  'Worker CMMS': 'CMMS Pekerja',
  'Back to CMMS 2 main page': 'Kembali ke halaman utama CMMS 2',
  'Back to Worker CMMS': 'Kembali ke CMMS Pekerja',
  'Back to Machine Service & Maintenance': 'Kembali ke Servis & Penyelenggaraan Mesin',
  'Log out': 'Log keluar',
  'Change language': 'Tukar bahasa',
  'Dark mode': 'Mod gelap',
  'Bright mode': 'Mod cerah',
  Company: 'Syarikat',
  'Your location': 'Lokasi anda',
  'All locations': 'Semua lokasi',
  'Diesel Usage Record': 'Rekod Penggunaan Diesel',
  'Machine Service & Maintenance': 'Servis & Penyelenggaraan Mesin',
  'No access': 'Tiada akses',
  'No company': 'Tiada syarikat',
  'No company is set up for this app yet. Ask the office.': 'Belum ada syarikat untuk aplikasi ini. Sila tanya pejabat.',
  'Not available': 'Tidak tersedia',
  'Fuel Manage is not enabled for this company.': 'Fuel Manage belum dibuka untuk syarikat ini.',
  'Machinery Manage is not enabled for this company.': 'Machinery Manage belum dibuka untuk syarikat ini.',
  'No access yet': 'Belum ada akses',
  'You cannot send requests for {company} yet. Ask your admin to tick “Send requests from the mobile app” (Maintenance Work Manage) for you.':
    'Anda belum boleh menghantar permohonan untuk {company}. Minta admin tandakan “Send requests from the mobile app” (Maintenance Work Manage) untuk anda.',
  'You cannot add fuel records for {company}. Ask your admin to tick “Add records” for you (Fuel Usage Record).':
    'Anda tidak boleh menambah rekod diesel untuk {company}. Minta admin tandakan “Add records” (Fuel Usage Record) untuk anda.',
  'Could not load.': 'Tidak dapat memuatkan.',
  'Could not send. Please try again.': 'Tidak dapat dihantar. Sila cuba lagi.',

  // ---- machine service & maintenance: start
  'What do you want to record?': 'Apa yang anda mahu rekod?',
  'Need a mechanic': 'Perlukan mekanik',
  'Repair request · machine has a problem': 'Permohonan baiki · mesin ada masalah',
  'I fixed something': 'Saya sudah baiki',
  'Corrective · e.g. changed a tyre, hose, battery': 'Pembaikan · cth. tukar tayar, hos, bateri',
  'Request a service': 'Mohon servis',
  'Preventive · when the machine is due': 'Pencegahan · apabila mesin sampai masa servis',
  'Your requests': 'Permohonan anda',
  'Nothing sent yet.': 'Belum ada yang dihantar.',
  Case: 'Kes',
  Machine: 'Mesin',
  Request: 'Permohonan',
  Done: 'Selesai',
  'Sent to supplier': 'Dihantar ke pembekal',
  Approved: 'Diluluskan',
  'Waiting approval': 'Menunggu kelulusan',
  Recorded: 'Direkodkan',
  'At workshop': 'Di bengkel',
  Pending: 'Belum selesai',

  // ---- shared by the forms
  Back: 'Kembali',
  Location: 'Lokasi',
  'Choose…': 'Pilih…',
  'No machine in this location.': 'Tiada mesin di lokasi ini.',
  Video: 'Video',
  Remove: 'Buang',
  'Photo of the meter': 'Gambar meter',
  'Meter reading': 'Bacaan meter',
  'Sending…': 'Menghantar…',
  Send: 'Hantar',
  'Choose the machine.': 'Pilih mesin.',
  'Sent · Case {no}': 'Dihantar · Kes {no}',
  'The office has it now. You can still add photos by WhatsApp with “{no}” in the caption.':
    'Pejabat sudah menerimanya. Anda masih boleh tambah gambar melalui WhatsApp dengan “{no}” dalam kapsyen.',
  'Last reading: {smu} {unit} on {date}': 'Bacaan terakhir: {smu} {unit} pada {date}',
  'The reading is lower than the last one ({smu} {unit}). Send anyway?': 'Bacaan lebih rendah daripada yang terakhir ({smu} {unit}). Hantar juga?',

  // ---- need a mechanic
  'Repair request': 'Permohonan baiki',
  'What is the problem?': 'Apa masalahnya?',
  "Won't start": 'Tidak boleh hidup',
  Leaking: 'Bocor',
  Noise: 'Bunyi bising',
  Overheat: 'Terlalu panas',
  'Tyre / track': 'Tayar / trek',
  Electrical: 'Elektrik',
  Others: 'Lain-lain',
  'Tell us more (optional)': 'Terangkan lagi (pilihan)',
  'e.g. Hydraulic leak at boom cylinder': 'cth. Hidraulik bocor di silinder boom',
  'Can the machine still work?': 'Mesin masih boleh bekerja?',
  'Yes, still working': 'Ya, masih boleh',
  'No, stopped': 'Tidak, berhenti',
  '“Stopped” counts as a breakdown from today until the case is solved.': '“Berhenti” dikira sebagai kerosakan dari hari ini sehingga kes selesai.',
  'Photos or video': 'Gambar atau video',
  'Hour meter (SMU) · optional': 'Meter jam (SMU) · pilihan',
  'Send to office': 'Hantar ke pejabat',
  'A case number is made (e.g. #8). The office picks the mechanic or workshop. You can still add photos by WhatsApp with “#8”.':
    'Nombor kes akan diberi (cth. #8). Pejabat akan pilih mekanik atau bengkel. Anda masih boleh tambah gambar melalui WhatsApp dengan “#8”.',
  'Say what the problem is.': 'Nyatakan masalahnya.',
  'Can the machine still work? Choose Yes or No.': 'Mesin masih boleh bekerja? Pilih Ya atau Tidak.',

  // ---- I fixed something
  Corrective: 'Pembaikan',
  'Record a repair': 'Rekod pembaikan',
  'Hour meter (SMU)': 'Meter jam (SMU)',
  'What part?': 'Bahagian mana?',
  Tyre: 'Tayar',
  Battery: 'Bateri',
  'Hydraulic hose': 'Hos hidraulik',
  Engine: 'Enjin',
  Brake: 'Brek',
  'What was done?': 'Apa yang dibuat?',
  Changed: 'Tukar',
  Repaired: 'Baiki',
  Adjusted: 'Laras',
  'Note (optional)': 'Catatan (pilihan)',
  'e.g. Front left tyre burst': 'cth. Tayar depan kiri pecah',
  'Parts used (optional)': 'Alat ganti digunakan (pilihan)',
  'e.g. Tyre 12.5/80-18': 'cth. Tayar 12.5/80-18',
  Part: 'Alat ganti',
  Quantity: 'Kuantiti',
  '+ Another part': '+ Alat ganti lain',
  Photos: 'Gambar',
  '+ Before': '+ Sebelum',
  '+ After': '+ Selepas',
  before: 'sebelum',
  after: 'selepas',
  meter: 'meter',
  'Machine stopped': 'Mesin berhenti',
  From: 'Dari',
  'Fixed on': 'Dibaiki pada',
  'Machine did not stop? Leave both empty. Not fixed yet? Leave “Fixed on” empty — the job stays Open.':
    'Mesin tidak berhenti? Biarkan kedua-duanya kosong. Belum dibaiki? Biarkan “Dibaiki pada” kosong — kerja kekal Terbuka.',
  'Choose the part.': 'Pilih bahagian.',
  'Choose what was done.': 'Pilih apa yang dibuat.',
  'Fill in “From” as well, or clear “Fixed on”.': 'Isi “Dari” juga, atau kosongkan “Dibaiki pada”.',
  '“Fixed on” cannot be before “From”.': '“Dibaiki pada” tidak boleh sebelum “Dari”.',

  // ---- request a service
  Preventive: 'Pencegahan',
  'Hour meter (SMU) now': 'Meter jam (SMU) sekarang',
  'Enter the meter reading.': 'Masukkan bacaan meter.',
  'Too early. You can request from {from} {unit}.': 'Terlalu awal. Anda boleh mohon mulai {from} {unit}.',
  'No service schedule is set for this machine yet, so it cannot be checked here. You can still send; the office will check it.':
    'Jadual servis belum ditetapkan untuk mesin ini, jadi tidak dapat disemak di sini. Anda masih boleh hantar; pejabat akan semak.',
  'Last service': 'Servis terakhir',
  'This service': 'Servis kali ini',
  '{interval} {unit} service at {due} {unit}': 'Servis {interval} {unit} pada {due} {unit}',
  'In the service window ({gap}). You can send.': 'Dalam tempoh servis ({gap}). Anda boleh hantar.',
  'due now': 'sampai masa sekarang',
  '{n} {unit} early': 'awal {n} {unit}',
  '{n} {unit} over': 'lebih {n} {unit}',
  'Too early. {more} {unit} more — you can request from {from} {unit}.': 'Terlalu awal. {more} {unit} lagi — anda boleh mohon mulai {from} {unit}.',
  'Late by {n} {unit}. Send the request now.': 'Lewat {n} {unit}. Hantar permohonan sekarang.',
  'Preferred date': 'Tarikh pilihan',
  'Will be sent to:': 'Akan dihantar kepada:',
  'the office (it picks the workshop)': 'pejabat (pejabat pilih bengkel)',
  ' · after the office approves': ' · selepas pejabat luluskan',
  'Send request': 'Hantar permohonan',
  'Meter reading wrong? Retake the photo and fix the number.': 'Bacaan meter salah? Ambil gambar semula dan betulkan nombor.',

  // ---- diesel usage record
  'Please take a photo.': 'Sila ambil gambar.',
  'Read from the photo. Check the number.': 'Dibaca daripada gambar. Semak nombor.',
  'Could not read the meter. Type the litres.': 'Meter tidak dapat dibaca. Taip jumlah liter.',
  'Take a photo of the meter first.': 'Ambil gambar meter dahulu.',
  'Choose the machine or vehicle.': 'Pilih mesin atau kenderaan.',
  'Enter the litres taken.': 'Masukkan liter yang diambil.',
  Sent: 'Dihantar',
  'Add another': 'Tambah lagi',
  'Take again': 'Ambil semula',
  'Take photo': 'Ambil gambar',
  'Machine / vehicle': 'Mesin / kenderaan',
  'Machine or vehicle': 'Mesin atau kenderaan',
  'Diesel taken (litres)': 'Diesel diambil (liter)',
  Litres: 'Liter',
  'Reading the photo…': 'Membaca gambar…',
  'Reading the meter from the photo…': 'Membaca meter daripada gambar…',
  'More than the tank ({tank} L). Check the number.': 'Lebih daripada tangki ({tank} L). Semak nombor.',
  Date: 'Tarikh',
  'Sent by you today': 'Dihantar oleh anda hari ini',
  'Meter reader': 'Pembaca meter'
}

const LANG_KEY = 'mjm-worker-lang'
const THEME_KEY = 'mjm-worker-theme'
const read = (key, allowed, fallback) => {
  try {
    const v = localStorage.getItem(key)
    return allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s)
const english = (s, vars) => fill(s, vars)

const Prefs = createContext({ lang: 'en', theme: 'light', t: english, setLang() {}, setTheme() {} })

export function WorkerPrefs({ children }) {
  const [lang, setLangState] = useState(() => read(LANG_KEY, ['en', 'ms'], 'en'))
  const [theme, setThemeState] = useState(() => read(THEME_KEY, ['light', 'dark'], 'light'))
  const save = (key, v) => {
    try {
      localStorage.setItem(key, v)
    } catch {
      // private mode: just not remembered
    }
  }
  const setLang = useCallback((v) => {
    setLangState(v)
    save(LANG_KEY, v)
  }, [])
  const setTheme = useCallback((v) => {
    setThemeState(v)
    save(THEME_KEY, v)
  }, [])
  // The page behind the app (seen when scrolling past the ends) follows the mode too.
  useEffect(() => {
    document.body.classList.toggle('wk-dark-body', theme === 'dark')
    return () => document.body.classList.remove('wk-dark-body')
  }, [theme])
  const t = useCallback((s, vars) => fill(lang === 'ms' ? MS[s] ?? s : s, vars), [lang])
  const value = useMemo(() => ({ lang, theme, t, setLang, setTheme }), [lang, theme, t, setLang, setTheme])
  return <Prefs.Provider value={value}>{children}</Prefs.Provider>
}

export const usePrefs = () => useContext(Prefs)
/** t('English text', { vars }) → the text in the chosen language. */
export const useT = () => useContext(Prefs).t
