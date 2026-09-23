import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const GREEN = '#22a33b'

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

const fmt = (n) => n.toLocaleString('ru-RU') + " so'm"

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

  if (error) return <p className="p-4 text-red-500">Xato: {error}</p>

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
            <button onClick={() => alert('Keyingi qadam: rasmiylashtirish')}
              className="fixed bottom-4 left-4 right-4 py-4 rounded-2xl font-semibold"
              style={{ background: GREEN }}>
              Buyurtmani rasmiylashtirish
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-28">
      <header className="px-4 pt-4 pb-2">
        <h1 className="text-2xl font-extrabold" style={{ color: GREEN }}>STAR FOOD</h1>
        <p className="text-sm text-neutral-400">Olmaliq · Yetkazib berish</p>
      </header>

      <nav className="sticky top-0 z-10 bg-neutral-950 px-4 py-2 flex gap-2 overflow-x-auto whitespace-nowrap">
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