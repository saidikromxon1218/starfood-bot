import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const GREEN = '#22a33b'
const SHOP_PHONE = '+998 93 009 70 00'
const STAMPS_NEEDED = 8

const CATEGORY_PHOTO = {
  'Pitsa': '/menus/pitsa.jpg',
  'Lavash': '/menus/lavash.jpg',
  'Burger': '/menus/burger.jpg',
  'Xaggi va Donar': '/menus/donar.jpg',
  'Hot dog': '/menus/hotdog.jpg',
  'Clab sandwich': '/menus/sandwich.jpg',
  'Trindwich': '/menus/trindwich.jpg',
  'Gazaklar': '/menus/gazaklar.jpg',
  'Souslar': '/menus/souslar.jpg',
}

const STATUS_LABEL = {
  sent: '🕐 Yuborildi',
  accepted: '✅ Qabul qilindi',
  en_route: "🛵 Yo'lda",
  delivered: '📦 Yetkazildi',
}

const fmt = (n) => n.toLocaleString('ru-RU') + " so'm"

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((r) => setTimeout(() => r(null), ms))])

function requestPhone() {
  return new Promise((resolve) => {
    const tg = window.Telegram?.WebApp
    if (!tg?.requestContact || !tg.isVersionAtLeast?.('6.9')) return resolve(null)
    tg.requestContact((sent, res) => {
      if (!sent) return resolve(null)
      resolve(res?.responseUnsafe?.contact?.phone_number || null)
    })
  })
}

function requestLocation() {
  return new Promise((resolve) => {
    const viaBrowser = () => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }
    const tg = window.Telegram?.WebApp
    const lm = tg?.LocationManager
    if (!lm || !tg.isVersionAtLeast?.('8.0')) return viaBrowser()
    const go = () => {
      if (!lm.isLocationAvailable) return viaBrowser()
      lm.getLocation((loc) => resolve(loc ? { lat: loc.latitude, lng: loc.longitude } : null))
    }
    if (lm.isInited) go()
    else lm.init(go)
  })
}

async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=uz,ru`
    )
    const j = await r.json()
    const a = j.address || {}
    const street = [a.road, a.house_number].filter(Boolean).join(', ')
    return street || (j.display_name || '').split(',').slice(0, 2).join(',').trim() || null
  } catch {
    return null
  }
}

function Photo({ src, alt }) {
  const [ok, setOk] = useState(true)
  if (!src || !ok) {
    return (
      <div className="w-20 h-20 shrink-0 rounded-xl bg-neutral-800 grid place-items-center text-2xl">
        🍽️
      </div>
    )
  }
  return (
    <img src={src} alt={alt} onError={() => setOk(false)}
      className="w-20 h-20 shrink-0 rounded-xl object-cover" />
  )
}

function Stepper({ qty, onDec, onInc }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onDec} className="w-8 h-8 rounded-full bg-neutral-800 text-lg">−</button>
      <span className="w-4 text-center">{qty}</span>
      <button onClick={onInc} className="w-8 h-8 rounded-full text-lg" style={{ background: GREEN }}>+</button>
    </div>
  )
}

export default function App() {
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)
  const [cart, setCart] = useState({})
  const [activeCat, setActiveCat] = useState(null)
  const [sizeFor, setSizeFor] = useState(null)
  const [view, setView] = useState('menu')

  const [phone, setPhone] = useState('')
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [coords, setCoords] = useState(null)
  const [locState, setLocState] = useState('idle')
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')

  const [sending, setSending] = useState(false)
  const [orderNumber, setOrderNumber] = useState(null)
  const [me, setMe] = useState(null)

  const loadMe = async (prefill) => {
    const initData = window.Telegram?.WebApp?.initData
    if (!initData) return
    try {
      const { data } = await supabase.functions.invoke('me', { body: { initData } })
      if (!data || data.error) return
      setMe(data)
      if (prefill) {
        if (data.phone) {
          setPhone(data.phone)
          setPhoneVerified(true)
        }
        if (data.address) setAddress(data.address)
        if (data.lat != null && data.lng != null) {
          setCoords({ lat: data.lat, lng: data.lng })
          setLocState('saved')
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    tg?.ready()
    tg?.expand()
    tg?.setHeaderColor?.('#0a0a0a')
    tg?.setBackgroundColor?.('#0a0a0a')

    supabase.from('menu_items').select('*').eq('is_available', true).order('sort_order')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setItems(data)
      })

    loadMe(true)
  }, [])

  const categories = useMemo(() => [...new Set(items.map((i) => i.category))], [items])

  const keyOf = (item, variant) => (variant ? `${item.id}:${variant.label}` : item.id)

  const add = (item, variant = null) => {
    const key = keyOf(item, variant)
    setCart((c) => ({ ...c, [key]: { item, variant, qty: (c[key]?.qty || 0) + 1 } }))
  }

  const change = (key, delta) => {
    setCart((c) => {
      const next = { ...c }
      const qty = c[key].qty + delta
      if (qty <= 0) delete next[key]
      else next[key] = { ...c[key], qty }
      return next
    })
  }

  const lines = Object.entries(cart)
  const count = lines.reduce((s, [, l]) => s + l.qty, 0)
  const total = lines.reduce((s, [, l]) => s + (l.variant?.price ?? l.item.price) * l.qty, 0)

  const goTo = (cat) => {
    setActiveCat(cat)
    document.getElementById('cat-' + cat)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const reorder = () => {
    const lo = me?.lastOrder
    if (!lo) return
    const next = {}
    let skipped = 0
    for (const it of lo.items || []) {
      const item = items.find((m) => m.id === it.menu_item_id)
      if (!item) { skipped++; continue }
      let variant = null
      if (it.variant_label) {
        variant = (item.variants || []).find((v) => v.label === it.variant_label)
        if (!variant) { skipped++; continue }
      }
      const key = keyOf(item, variant)
      next[key] = { item, variant, qty: (next[key]?.qty || 0) + it.qty }
    }
    setCart(next)
    setView('cart')
    if (skipped) alert("Ba'zi mahsulotlar hozir mavjud emas.")
  }

  const askPhone = async () => {
    const n = await withTimeout(requestPhone(), 30000)
    if (n) {
      setPhone(n.startsWith('+') ? n : '+' + n)
      setPhoneVerified(true)
    } else {
      alert("Raqam olinmadi. Iltimos, qo'lda yozing.")
    }
  }

  const askLocation = async () => {
    setLocState('loading')
    const c = await withTimeout(requestLocation(), 15000)
    if (!c) return setLocState('failed')
    setCoords(c)
    setLocState('done')
    const street = await withTimeout(reverseGeocode(c.lat, c.lng), 8000)
    if (street) setAddress((prev) => (prev.trim() ? prev : street + ', '))
  }

  const submit = async () => {
    if (sending) return
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-order', {
        body: {
          initData: window.Telegram?.WebApp?.initData || '',
          items: lines.map(([, l]) => ({
            id: l.item.id,
            variant: l.variant?.label ?? null,
            qty: l.qty,
          })),
          phone,
          address,
          note,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        },
      })
      if (error || !data?.ok) throw error || new Error('failed')

      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success')
      setOrderNumber(data.number)
      setCart({})
      setNote('')
      setView('done')
      loadMe(false)
    } catch (e) {
      console.error(e)
      alert(`Buyurtma yuborilmadi. Qayta urinib ko'ring yoki qo'ng'iroq qiling: ${SHOP_PHONE}`)
    } finally {
      setSending(false)
    }
  }

  if (error) return <p className="p-4 text-red-500">Xato: {error}</p>

  if (view === 'done') {
    return (
      <div className="min-h-screen bg-neutral-950 text-white p-6 flex flex-col items-center justify-center text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold mb-2">Buyurtma #{orderNumber} yuborildi</h1>
        <p className="text-neutral-400 mb-6">Operator tez orada buyurtmangizni tasdiqlaydi.</p>
        <p className="text-sm text-neutral-500 mb-10">Savollar uchun: {SHOP_PHONE}</p>
        <button onClick={() => { setView('menu'); loadMe(false) }}
          className="w-full py-4 rounded-2xl font-semibold" style={{ background: GREEN }}>
          Menyuga qaytish
        </button>
      </div>
    )
  }

  if (view === 'checkout') {
    const digits = phone.replace(/\D/g, '')
    const canSubmit = count > 0 && digits.length >= 9 && address.trim().length >= 5 && !sending
    return (
      <div className="min-h-screen bg-neutral-950 text-white p-4 pb-32">
        <button onClick={() => setView('cart')} className="text-sm text-neutral-400 mb-4">
          ← Savatga qaytish
        </button>
        <h1 className="text-2xl font-bold mb-5">Rasmiylashtirish</h1>

        <p className="text-sm text-neutral-400 mb-2">Telefon raqam</p>
        {!phoneVerified && (
          <button onClick={askPhone} className="w-full py-3 rounded-xl font-semibold mb-2"
            style={{ background: GREEN }}>
            📱 Raqamni ulashish
          </button>
        )}
        <div className="relative mb-5">
          <input type="tel" inputMode="tel" value={phone}
            onChange={(e) => { setPhone(e.target.value); setPhoneVerified(false) }}
            placeholder="+998 90 123 45 67"
            className="w-full px-4 py-3 rounded-xl bg-neutral-900 outline-none" />
          {phoneVerified && <span className="absolute right-4 top-3" style={{ color: GREEN }}>✓</span>}
        </div>

        <p className="text-sm text-neutral-400 mb-2">Yetkazib berish manzili</p>
        <button onClick={askLocation} disabled={locState === 'loading'}
          className="w-full py-3 rounded-xl bg-neutral-900 mb-2">
          {locState === 'loading' ? 'Aniqlanmoqda...'
            : locState === 'done' ? '📍 Joylashuv olindi ✓'
              : locState === 'saved' ? '📍 Oldingi joylashuv ✓ · yangilash'
                : '📍 Joylashuvni yuborish'}
        </button>
        {locState === 'failed' && (
          <p className="text-xs text-amber-400 mb-2">Joylashuv olinmadi. Manzilni batafsil yozing.</p>
        )}
        <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3}
          placeholder="Ko'cha, uy, qavat, xonadon, mo'ljal"
          className="w-full px-4 py-3 rounded-xl bg-neutral-900 outline-none mb-5" />

        <p className="text-sm text-neutral-400 mb-2">Izoh (ixtiyoriy)</p>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: piyozsiz"
          className="w-full px-4 py-3 rounded-xl bg-neutral-900 outline-none mb-5" />

        <p className="text-sm text-neutral-400 mb-2">To'lov</p>
        <div className="px-4 py-3 rounded-xl bg-neutral-900 mb-5">💵 Naqd pul</div>

        <div className="flex justify-between text-lg font-bold">
          <span>Jami</span><span>{fmt(total)}</span>
        </div>
        <p className="text-xs text-neutral-500 mt-1">+ yetkazib berish narxi</p>

        <button onClick={submit} disabled={!canSubmit}
          className="fixed bottom-4 left-4 right-4 py-4 rounded-2xl font-semibold"
          style={{ background: canSubmit ? GREEN : '#333', color: canSubmit ? '#fff' : '#888' }}>
          {sending ? 'Yuborilmoqda...' : 'Buyurtma berish'}
        </button>
      </div>
    )
  }

  if (view === 'cart') {
    return (
      <div className="min-h-screen bg-neutral-950 text-white p-4 pb-28">
        <button onClick={() => setView('menu')} className="text-sm text-neutral-400 mb-4">
          ← Menyuga qaytish
        </button>
        <h1 className="text-2xl font-bold mb-4">Savat</h1>
        {lines.length === 0 && <p className="text-neutral-400">Savat bo'sh</p>}
        {lines.map(([key, l]) => (
          <div key={key} className="flex items-center justify-between py-3 border-b border-neutral-800">
            <div>
              <p className="font-semibold">{l.item.name}{l.variant ? ` · ${l.variant.label}` : ''}</p>
              <p className="text-sm text-neutral-400">{fmt((l.variant?.price ?? l.item.price) * l.qty)}</p>
            </div>
            <Stepper qty={l.qty} onDec={() => change(key, -1)} onInc={() => change(key, 1)} />
          </div>
        ))}
        {lines.length > 0 && (
          <>
            <div className="flex justify-between text-lg font-bold mt-4">
              <span>Jami</span><span>{fmt(total)}</span>
            </div>
            <button onClick={() => setView('checkout')}
              className="fixed bottom-4 left-4 right-4 py-4 rounded-2xl font-semibold"
              style={{ background: GREEN }}>
              Buyurtmani rasmiylashtirish
            </button>
          </>
        )}
      </div>
    )
  }

  const stamps = me?.stamps ?? 0

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-28">
      <header className="px-4 pt-4 pb-2">
        <h1 className="text-2xl font-extrabold" style={{ color: GREEN }}>STAR FOOD</h1>
        <p className="text-sm text-neutral-400">Olmaliq · Yetkazib berish</p>
      </header>

      {me && (
        <div className="mx-4 mt-2 p-4 rounded-2xl bg-neutral-900">
          <div className="flex justify-between items-center mb-3">
            <span className="font-semibold">⭐ Sodiqlik kartasi</span>
            <span className="text-sm text-neutral-400">
              {Math.min(stamps, STAMPS_NEEDED)}/{STAMPS_NEEDED}
            </span>
          </div>
          <div className="flex gap-2">
            {Array.from({ length: STAMPS_NEEDED }).map((_, i) => (
              <div key={i} className="flex-1 aspect-square rounded-full grid place-items-center text-sm"
                style={{ background: i < stamps ? GREEN : '#262626' }}>
                {i < stamps ? '★' : ''}
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-400 mt-3">
            {stamps >= STAMPS_NEEDED
              ? "🎁 Sovg'angiz tayyor! Buyurtmada operatorga ayting."
              : `Yana ${STAMPS_NEEDED - stamps} ta buyurtmadan keyin — sovg'a!`}
          </p>
        </div>
      )}

      {me?.lastOrder && (
        <div className="mx-4 mt-3 p-4 rounded-2xl bg-neutral-900">
          <div className="flex justify-between items-center mb-1">
            <span className="font-semibold">Oxirgi buyurtma #{me.lastOrder.number}</span>
            <span className="text-sm text-neutral-400">{STATUS_LABEL[me.lastOrder.status] || ''}</span>
          </div>
          <p className="text-xs text-neutral-400 line-clamp-2 mb-3">
            {(me.lastOrder.items || [])
              .map((i) => `${i.qty}× ${i.name}${i.variant_label ? ' ' + i.variant_label : ''}`)
              .join(', ')}
          </p>
          <button onClick={reorder}
            className="w-full py-2.5 rounded-xl font-semibold" style={{ background: GREEN }}>
            🔁 Qayta buyurtma
          </button>
        </div>
      )}

      <nav className="sticky top-0 z-10 bg-neutral-950 px-4 py-2 mt-2 flex gap-2 overflow-x-auto whitespace-nowrap">
        {categories.map((cat) => (
          <button key={cat} onClick={() => goTo(cat)}
            className="px-4 py-1.5 rounded-full text-sm shrink-0"
            style={{ background: activeCat === cat ? GREEN : '#262626' }}>
            {cat}
          </button>
        ))}
      </nav>

      {categories.map((cat) => (
        <section key={cat} id={'cat-' + cat} className="px-4 pt-4 scroll-mt-14">
          <h2 className="text-lg font-bold mb-2">{cat}</h2>
          {items.filter((i) => i.category === cat).map((item) => {
            const hasSizes = Array.isArray(item.variants) && item.variants.length > 0
            const qty = cart[item.id]?.qty || 0
            return (
              <div key={item.id} className="flex gap-3 py-3 border-b border-neutral-800">
                <Photo src={item.photo_url || CATEGORY_PHOTO[item.category]} alt={item.name} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{item.name}</p>
                  {item.description && (
                    <p className="text-xs text-neutral-400 line-clamp-2">{item.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm">{hasSizes ? fmt(item.price) + ' dan' : fmt(item.price)}</span>
                    {hasSizes ? (
                      <button onClick={() => setSizeFor(item)}
                        className="px-3 py-1.5 rounded-full text-sm" style={{ background: GREEN }}>
                        Tanlash
                      </button>
                    ) : qty === 0 ? (
                      <button onClick={() => add(item)}
                        className="w-8 h-8 rounded-full text-lg" style={{ background: GREEN }}>+</button>
                    ) : (
                      <Stepper qty={qty} onDec={() => change(item.id, -1)} onInc={() => change(item.id, 1)} />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </section>
      ))}

      {sizeFor && (
        <div className="fixed inset-0 z-20 bg-black/60 flex items-end" onClick={() => setSizeFor(null)}>
          <div className="w-full bg-neutral-900 rounded-t-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">{sizeFor.name}</p>
            {sizeFor.description && <p className="text-sm text-neutral-400 mb-4">{sizeFor.description}</p>}
            <div className="flex flex-col gap-2">
              {sizeFor.variants.map((v) => (
                <button key={v.label} onClick={() => { add(sizeFor, v); setSizeFor(null) }}
                  className="flex justify-between px-4 py-3 rounded-xl bg-neutral-800">
                  <span>{v.label}</span><span>{fmt(v.price)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {count > 0 && (
        <button onClick={() => setView('cart')}
          className="fixed bottom-4 left-4 right-4 z-10 flex justify-between px-5 py-4 rounded-2xl font-semibold"
          style={{ background: GREEN }}>
          <span>Savat · {count}</span><span>{fmt(total)}</span>
        </button>
      )}
    </div>
  )
}