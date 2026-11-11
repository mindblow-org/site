(() => {
  const $ = (s, el = document) => el.querySelector(s)
  const $$ = (s, el = document) => [...el.querySelectorAll(s)]
  document.documentElement.classList.replace('nojs', 'js')
  const calm = matchMedia('(prefers-reduced-motion: reduce)')
  const SVG = 'http://www.w3.org/2000/svg'

  const keep = {
    get(k, d) {
      try {
        const v = localStorage.getItem('mindblow.' + k)
        return v ? JSON.parse(v) : d
      } catch {
        return d
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('mindblow.' + k, JSON.stringify(v))
      } catch {}
    },
  }

  /* ------------------------------------------------------------ experimente aqui */
  const QUESTS = ['drag', 'pin', 'filter', 'board', 'draw', 'add']
  const done = new Set(keep.get('quests', []))

  function paintQuests() {
    for (const li of $$('[data-quest]')) {
      const on = done.has(li.dataset.quest)
      li.classList.toggle('done', on)
      $('.box', li).classList.toggle('done', on)
    }
    const n = QUESTS.filter((q) => done.has(q)).length
    for (const e of $$('[data-quests-n]')) e.textContent = `${n}/${QUESTS.length}${n === QUESTS.length ? ' ✦' : ''}`
    for (const b of $$('[data-quests-bar]')) b.style.width = `${(n / QUESTS.length) * 100}%`
  }

  function quest(k, on = true) {
    if (done.has(k) === on) return
    on ? done.add(k) : done.delete(k)
    keep.set('quests', [...done])
    paintQuests()
  }

  document.addEventListener('click', (e) => {
    const li = e.target.closest('.checks [data-quest]')
    if (li) quest(li.dataset.quest, !done.has(li.dataset.quest))
  })

  /* ------------------------------------------------------------ grid */
  const main = $('#main')
  const wall = $('.wall')
  const inner = $('.inner')
  const grid = $('.grid')
  const heads = Object.fromEntries($$('.head', grid).map((e) => [e.dataset.for, e]))
  const W = 212
  const G = 20
  const HEAD = 34
  const GAP = 32
  const RATIO = { sticky: 1, text: 1.415, todo: 1.415, board: 1.415 }

  const slot = document.createElement('div')
  slot.className = 'slot'
  grid.prepend(slot)

  let cards = $$('.card', grid)
  let last = new Map()
  let dims = { n: 1, w: W, g: G }
  let drag = null
  let dragged = false
  let kind = 'all'

  const sec = (c) => (c.classList.contains('pinned') ? 'pin' : 'rest')
  const cardOf = (id) => cards.find((c) => c.dataset.id === id)
  const at = (el, b) => (el.style.transform = `translate(${b.x}px, ${b.y}px)`)

  function size(room) {
    if (room >= 2 * W + G) return { n: Math.floor((room + G) / (W + G)), w: W, g: G }
    const g = 12
    return { n: 2, w: Math.max(120, Math.floor((room - g) / 2)), g }
  }

  function layout() {
    if (!wall.clientWidth) return
    const cs = getComputedStyle(wall)
    const s = (dims = size(wall.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)))
    inner.style.width = `${s.n * (s.w + s.g) - s.g}px`
    grid.classList.toggle('small', s.w < W)

    const shown = cards.filter((c) => !c.classList.contains('out'))
    const labels = shown.some((c) => sec(c) === 'pin')
    const pos = new Map()
    let top = 0
    for (const k of ['pin', 'rest']) {
      const list = shown.filter((c) => sec(c) === k)
      heads[k].classList.toggle('on', labels && list.length > 0)
      at(heads[k], { x: 0, y: top })
      if (!list.length) continue
      if (labels) top += HEAD
      const col = Array(s.n).fill(top)
      for (const c of list) {
        const span = c.dataset.span === '2' ? 2 : 1
        const w = span * s.w + (span - 1) * s.g
        const h = Math.round(w * RATIO[c.dataset.kind])
        let i = 0
        let y = Infinity
        for (let j = 0; j <= s.n - span; j++) {
          const t = Math.max(...col.slice(j, j + span))
          if (t < y) [i, y] = [j, t]
        }
        pos.set(c, { x: i * (s.w + s.g), y, w, h })
        col.fill(y + h + s.g, i, i + span)
      }
      top = Math.max(...col) - s.g + GAP
    }
    grid.style.height = `${Math.max(0, top - GAP)}px`

    for (const [c, b] of pos) {
      c.style.width = `${b.w}px`
      c.style.height = `${b.h}px`
      if (drag?.on && c === drag.card) {
        slot.style.width = `${b.w}px`
        slot.style.height = `${b.h}px`
        at(slot, b)
        continue
      }
      at(c, b)
    }
    last = pos
  }

  function near(x, y, k) {
    let best = null
    let min = dims.w * 0.6
    for (const [c, b] of last) {
      if (sec(c) !== k) continue
      const d = Math.hypot(b.x + b.w / 2 - x, b.y + b.h / 2 - y)
      if (d < min) [min, best] = [d, c]
    }
    return best
  }

  grid.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.card')
    if (!card || e.button !== 0 || e.target.closest('.act, a') || e.target.isContentEditable) return
    const b = last.get(card)
    if (!b) return
    drag = { card, id: e.pointerId, sx: e.clientX, sy: e.clientY, x: b.x, y: b.y, on: false, ready: e.pointerType !== 'touch', timer: 0 }
    if (!drag.ready) {
      drag.timer = setTimeout(() => {
        if (!drag) return
        drag.ready = true
        card.classList.add('hold')
      }, 250)
    }
  })

  addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.sx
    const dy = e.clientY - drag.sy
    if (!drag.on) {
      if (Math.hypot(dx, dy) < 5) return
      if (!drag.ready) return stop()
      drag.on = true
      try {
        drag.card.setPointerCapture(e.pointerId)
      } catch {}
      drag.card.classList.add('lift')
      slot.classList.add('on')
      layout()
    }
    const b = last.get(drag.card)
    const x = drag.x + dx
    const y = drag.y + dy
    at(drag.card, { x, y })
    const t = near(x + b.w / 2, y + b.h / 2, sec(drag.card))
    if (t && t !== drag.card) {
      const to = cards.indexOf(t)
      cards.splice(cards.indexOf(drag.card), 1)
      cards.splice(to, 0, drag.card)
      layout()
    }
  })

  // no touch, segurar 250ms antes; depois disso o dedo arrasta em vez de rolar
  grid.addEventListener(
    'touchmove',
    (e) => {
      if (drag?.ready) e.preventDefault()
    },
    { passive: false },
  )

  function stop(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return
    const { card, on, timer } = drag
    clearTimeout(timer)
    card.classList.remove('hold')
    drag = null
    if (!on) return
    dragged = true
    setTimeout(() => (dragged = false), 0)
    card.classList.remove('lift')
    slot.classList.remove('on')
    layout()
    quest('drag')
  }
  addEventListener('pointerup', stop)
  addEventListener('pointercancel', stop)

  grid.addEventListener('click', (e) => {
    if (dragged) return
    if (e.target.closest('a')) return
    const card = e.target.closest('.card')
    if (!card) return
    const act = e.target.closest('.act')
    if (act?.dataset.act === 'pin') return pin(card, act)
    if (act?.dataset.act === 'del') return drop(card)
    if (card.classList.contains('mine')) return write(card)
    open(card.dataset.id)
  })

  grid.addEventListener('keydown', (e) => {
    const card = e.target.closest?.('.card')
    if (!card || e.target !== card || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    card.classList.contains('mine') ? write(card) : open(card.dataset.id)
  })

  function pin(card, act) {
    const on = card.classList.toggle('pinned')
    act.classList.toggle('on', on)
    act.title = act.ariaLabel = on ? 'Desafixar' : 'Fixar'
    layout()
    if (on) quest('pin')
  }

  function counts() {
    const n = { all: cards.length, sticky: 0, text: 0, todo: 0, board: 0 }
    for (const c of cards) n[c.dataset.kind]++
    for (const e of $$('[data-count]')) e.textContent = n[e.dataset.count]
  }

  function filter(k) {
    kind = k
    for (const b of $$('.filter [data-kind]')) b.classList.toggle('on', b.dataset.kind === k)
    for (const c of cards) c.classList.toggle('out', k !== 'all' && c.dataset.kind !== k)
    layout()
  }

  $('.filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]')
    if (!b) return
    filter(b.dataset.kind)
    if (kind !== 'all') quest('filter')
  })

  /* ------------------------------------------------------------ stickies do + */
  let mine = keep.get('stickies', [])
  const saveMine = () => keep.set('stickies', mine)

  function sticky(s) {
    const c = document.createElement('article')
    c.className = 'card sticky mine'
    c.dataset.id = s.id
    c.dataset.kind = 'sticky'
    c.tabIndex = 0
    c.innerHTML =
      '<span class="acts"><button class="act" data-act="del" title="Apagar" aria-label="Apagar"><svg class="i sm"><use href="#trash"/></svg></button></span><p data-ph="escreva aqui"></p>'
    $('p', c).textContent = s.text
    return c
  }

  function write(card) {
    const p = $('p', card)
    p.contentEditable = 'plaintext-only'
    if (p.contentEditable !== 'plaintext-only') p.contentEditable = 'true'
    p.focus({ preventScroll: true })
    const r = document.createRange()
    r.selectNodeContents(p)
    r.collapse(false)
    getSelection().removeAllRanges()
    getSelection().addRange(r)
  }

  function drop(card) {
    mine = mine.filter((s) => s.id !== card.dataset.id)
    saveMine()
    cards = cards.filter((c) => c !== card)
    card.classList.add('out')
    setTimeout(() => card.remove(), 200)
    counts()
    layout()
  }

  grid.addEventListener('input', (e) => {
    const card = e.target.closest('.mine')
    if (!card) return
    const p = e.target
    if (p.textContent.length > 500) p.textContent = p.textContent.slice(0, 500)
    const s = mine.find((x) => x.id === card.dataset.id)
    if (s) s.text = p.textContent
    saveMine()
  })

  grid.addEventListener('focusout', (e) => {
    const card = e.target.closest?.('.mine')
    if (!card || !e.target.isContentEditable) return
    e.target.contentEditable = 'false'
    if (!e.target.textContent.trim()) drop(card)
  })

  function add() {
    if (cur) show(null)
    if (kind !== 'all' && kind !== 'sticky') filter('all')
    const s = { id: 'm' + Date.now().toString(36), text: '' }
    mine.unshift(s)
    saveMine()
    const c = sticky(s)
    c.classList.add('fresh')
    c.addEventListener('animationend', () => c.classList.remove('fresh'), { once: true })
    grid.append(c)
    const i = cards.findIndex((x) => sec(x) === 'rest')
    cards.splice(i < 0 ? cards.length : i, 0, c)
    layout()
    counts()
    const y = grid.offsetTop + last.get(c).y
    if (y < main.scrollTop || y + last.get(c).h > main.scrollTop + main.clientHeight) {
      main.scrollTo({ top: Math.max(0, y - 80), behavior: calm.matches ? 'auto' : 'smooth' })
    }
    write(c)
    quest('add')
  }
  $('#add').addEventListener('click', add)

  for (const s of mine.slice().reverse()) {
    if (!s.text.trim()) continue
    const c = sticky(s)
    grid.append(c)
    const i = cards.findIndex((x) => sec(x) === 'rest')
    cards.splice(i < 0 ? cards.length : i, 0, c)
  }
  mine = mine.filter((s) => s.text.trim())
  saveMine()

  /* ------------------------------------------------------------ abas e notas abertas */
  const tabs = $('#tabs')
  const ICON = { sticky: 'k-sticky', text: 'k-text', todo: 'k-todo', board: 'k-board' }
  let opened = []
  let cur = null
  let home = 0

  const viewOf = (id) => $(`.view[data-view="${id ?? ''}"]`)
  const surf = (id) => $('.surf', viewOf(id)) ?? viewOf(id)

  // sticky não tem tela escrita à mão: a nota aberta é o próprio card, num quadrão
  for (const c of cards) {
    if (c.dataset.kind !== 'sticky' || c.classList.contains('mine') || viewOf(c.dataset.id)) continue
    const v = document.createElement('section')
    v.className = 'view'
    v.dataset.view = c.dataset.id
    v.hidden = true
    const big = document.createElement('div')
    big.className = 'big surf'
    if (c.classList.contains('big')) big.classList.add('logo-big')
    if (c.classList.contains('photo')) big.classList.add('photo')
    for (const n of c.children) if (!n.classList.contains('acts')) big.append(n.cloneNode(true))
    const word = $('h1', big)
    if (word) word.outerHTML = `<div class="word">${word.textContent}</div>`
    const stage = document.createElement('div')
    stage.className = 'stage'
    stage.append(big)
    v.append(stage)
    main.append(v)
  }

  function tab(id) {
    const c = cardOf(id)
    const t = document.createElement('button')
    t.className = 'tab'
    t.dataset.tab = id
    t.innerHTML = `<svg class="i sm"><use href="#${ICON[c.dataset.kind]}"/></svg><span class="t"></span><span class="x" role="button" aria-label="Fechar aba" title="Fechar"><svg class="i xs"><use href="#x"/></svg></span>`
    $('.t', t).textContent = c.dataset.title
    return t
  }

  function paintTabs() {
    for (const t of $$('.tab', tabs)) {
      const on = (t.dataset.tab || null) === cur
      t.classList.toggle('on', on)
      on ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current')
      if (on) t.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }

  function addTab(id, enter = true) {
    if (opened.includes(id)) return
    opened.push(id)
    const t = tab(id)
    if (enter && !calm.matches) {
      t.classList.add('enter')
      t.addEventListener('animationend', () => t.classList.remove('enter'), { once: true })
    }
    tabs.append(t)
  }

  function closeTab(id) {
    opened = opened.filter((x) => x !== id)
    const t = $(`.tab[data-tab="${id}"]`, tabs)
    if (cur === id) show(null)
    if (!t) return
    if (calm.matches) return t.remove()
    t.classList.add('leave')
    t.addEventListener('animationend', () => t.remove(), { once: true })
  }

  function open(id) {
    if (!cardOf(id)) return
    addTab(id)
    show(id)
  }

  function show(id, still = false) {
    const prev = cur
    if (prev === id) return
    const run = () => {
      if (prev === null) home = main.scrollTop
      for (const v of $$('.view')) v.hidden = (v.dataset.view || null) !== id
      cur = id
      if (id === null) layout()
      main.scrollTop = id === null ? home : 0
      paintTabs()
      const c = id && cardOf(id)
      document.title = c ? `${c.dataset.title} · mindblow` : 'mindblow'
      history.replaceState(null, '', id ? `#${id}` : location.pathname + location.search)
      if (id === 'como-funciona') {
        quest('board')
        zoom()
      }
    }
    if (still || !document.startViewTransition || calm.matches) return run()

    // o card cresce até virar a nota aberta, e volta para o lugar ao fechar
    const card = cardOf(id ?? prev)
    const fromCard = prev === null && card && !card.classList.contains('out')
    const toCard = id === null && card && !card.classList.contains('out')
    if (fromCard) card.style.viewTransitionName = 'note'
    if (toCard) surf(prev).style.viewTransitionName = 'note'
    const vt = document.startViewTransition(() => {
      if (fromCard) {
        card.style.viewTransitionName = ''
        surf(id).style.viewTransitionName = 'note'
      }
      if (toCard) {
        surf(prev).style.viewTransitionName = ''
        run()
        card.style.viewTransitionName = 'note'
        return
      }
      run()
    })
    vt.finished.finally(() => {
      for (const el of $$('.card, .surf')) el.style.viewTransitionName = ''
    })
  }

  tabs.addEventListener('click', (e) => {
    const t = e.target.closest('.tab')
    if (!t) return
    if (e.target.closest('.x')) return closeTab(t.dataset.tab)
    show(t.dataset.tab || null)
  })

  tabs.addEventListener('auxclick', (e) => {
    const t = e.target.closest('.tab')
    if (e.button === 1 && t?.dataset.tab) closeTab(t.dataset.tab)
  })

  addEventListener('hashchange', () => {
    const id = decodeURIComponent(location.hash.slice(1))
    if (!id) return show(null)
    if (cardOf(id)) open(id)
  })

  addEventListener('keydown', (e) => {
    if (e.target.isContentEditable) {
      if (e.key === 'Escape') e.target.blur()
      return
    }
    if (e.key === 'Escape' && cur) return show(null)
    if (cur === 'como-funciona' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      e.shiftKey ? redo() : undo()
    }
  })

  /* ------------------------------------------------------------ board */
  const board = viewOf('como-funciona')
  const box = $('.stagebox', board)
  const scenes = $$('.scene', board)
  const scene = () => scenes.find((s) => s.getClientRects().length && getComputedStyle(s).display !== 'none')
  let tool = 'select'
  let tone = 0
  let past = []
  let future = []
  let pen = null

  function pick(t) {
    tool = t
    for (const b of $$('[data-tool]', board)) {
      b.classList.toggle('on', b.dataset.tool === t)
      b.setAttribute('aria-pressed', b.dataset.tool === t)
    }
    box.classList.toggle('draw', t !== 'select')
  }

  function paint(i) {
    tone = i
    for (const b of $$('[data-tone]', board)) {
      b.classList.toggle('on', +b.dataset.tone === i)
      b.setAttribute('aria-pressed', +b.dataset.tone === i)
    }
    if (tool === 'select') pick('pen')
  }

  function zoom() {
    const s = scene()
    const m = s?.getScreenCTM()
    if (m) $('[data-zoom]', board).textContent = `${Math.round(m.a * 100)}%`
  }

  const local = (svg, e) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse())
    return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]
  }

  function smooth(pts) {
    if (pts.length < 3) return `M${pts.flat().join(' ')}L${pts.at(-1).join(' ')}`
    let d = `M${pts[0].join(' ')}`
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i]
      const [nx, ny] = pts[i + 1]
      d += `Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`
    }
    return d + `L${pts.at(-1).join(' ')}`
  }

  function arrowPath([x1, y1], [x2, y2]) {
    const a = Math.atan2(y2 - y1, x2 - x1)
    const l = 16
    const h = (s) => `${(x2 - l * Math.cos(a + s)).toFixed(1)} ${(y2 - l * Math.sin(a + s)).toFixed(1)}`
    return `M${x1} ${y1}L${x2} ${y2}M${h(0.5)}L${x2} ${y2}L${h(-0.5)}`
  }

  function shape(el, a, b) {
    const [x, y] = [Math.min(a[0], b[0]), Math.min(a[1], b[1])]
    const [w, h] = [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])]
    if (tool === 'rect') {
      el.setAttribute('x', x)
      el.setAttribute('y', y)
      el.setAttribute('width', w)
      el.setAttribute('height', h)
      el.setAttribute('rx', 4)
    } else if (tool === 'ellipse') {
      el.setAttribute('cx', x + w / 2)
      el.setAttribute('cy', y + h / 2)
      el.setAttribute('rx', w / 2)
      el.setAttribute('ry', h / 2)
    } else if (tool === 'arrow') {
      el.setAttribute('d', arrowPath(a, b))
    }
    return Math.hypot(w, h)
  }

  box.addEventListener('pointerdown', (e) => {
    if (tool === 'select' || e.button !== 0) return
    const svg = scene()
    if (!svg) return
    const p = local(svg, e)
    const el = document.createElementNS(SVG, { pen: 'path', arrow: 'path', rect: 'rect', ellipse: 'ellipse' }[tool])
    el.setAttribute('class', `k${tone}`)
    $('.ink', svg).append(el)
    pen = { el, svg, id: e.pointerId, a: p, pts: [p], size: 0 }
    if (tool === 'pen') el.setAttribute('d', smooth(pen.pts))
    box.setPointerCapture(e.pointerId)
  })

  box.addEventListener('pointermove', (e) => {
    if (!pen || e.pointerId !== pen.id) return
    const p = local(pen.svg, e)
    if (tool === 'pen') {
      const q = pen.pts.at(-1)
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 2) return
      pen.pts.push(p)
      pen.size = Math.max(pen.size, Math.hypot(p[0] - pen.a[0], p[1] - pen.a[1]))
      pen.el.setAttribute('d', smooth(pen.pts))
    } else {
      pen.size = shape(pen.el, pen.a, p)
    }
  })

  function finish(e) {
    if (!pen || e.pointerId !== pen.id) return
    const { el, svg, size } = pen
    pen = null
    if (size < 4 && tool !== 'pen') return el.remove()
    past.push({ el, svg })
    future = []
    sync()
    quest('draw')
  }
  box.addEventListener('pointerup', finish)
  box.addEventListener('pointercancel', finish)

  function undo() {
    const s = past.pop()
    if (!s) return
    s.el.remove()
    future.push(s)
    sync()
  }

  function redo() {
    const s = future.pop()
    if (!s) return
    $('.ink', s.svg).append(s.el)
    past.push(s)
    sync()
  }

  const ATTRS = ['class', 'd', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy']

  function sync() {
    $('[data-undo]', board).disabled = !past.length
    $('[data-redo]', board).disabled = !future.length
    const ink = {}
    for (const svg of scenes) {
      ink[svg.classList.contains('tall') ? 'tall' : 'wide'] = $$('.ink > *', svg).map((el) => ({
        n: el.tagName,
        a: Object.fromEntries(ATTRS.filter((k) => el.hasAttribute(k)).map((k) => [k, el.getAttribute(k)])),
      }))
    }
    keep.set('ink', ink)
  }

  const saved = keep.get('ink', {})
  for (const svg of scenes) {
    for (const s of saved[svg.classList.contains('tall') ? 'tall' : 'wide'] ?? []) {
      if (!['path', 'rect', 'ellipse'].includes(s.n)) continue
      const el = document.createElementNS(SVG, s.n)
      for (const k of ATTRS) if (s.a?.[k] != null) el.setAttribute(k, s.a[k])
      $('.ink', svg).append(el)
    }
  }

  board.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tool]')
    if (t) return pick(t.dataset.tool)
    const c = e.target.closest('[data-tone]')
    if (c) {
      const tones = c.parentElement
      // no celular só a cor escolhida aparece; tocar nela abre as outras
      if (matchMedia('(max-width: 640px)').matches && !tones.classList.contains('open')) return tones.classList.add('open')
      tones.classList.remove('open')
      return paint(+c.dataset.tone)
    }
    if (e.target.closest('[data-undo]')) return undo()
    if (e.target.closest('[data-redo]')) return redo()
    if (e.target.closest('[data-clear]')) {
      for (const svg of scenes) $('.ink', svg).replaceChildren()
      past = []
      future = []
      sync()
    }
  })

  /* ------------------------------------------------------------ download */
  const REPO = 'mindblow-org/mindblow'
  const ASSETS = {
    appimage: (n) => n.endsWith('.AppImage'),
    deb: (n) => n.endsWith('.deb'),
    setup: (n) => n.endsWith('-setup.exe'),
    'srv-linux-x64': (n) => n === 'mindblow-linux-x64',
    'srv-linux-arm64': (n) => n === 'mindblow-linux-arm64',
    'srv-win-x64': (n) => n === 'mindblow-windows-x64.exe',
  }
  const mb = (b) => `${(b / 1048576).toFixed(b < 10 * 1048576 ? 1 : 0).replace('.', ',')} MB`

  const os = (() => {
    const p = `${navigator.userAgentData?.platform ?? navigator.platform ?? ''} ${navigator.userAgent}`
    if (/android|iphone|ipad|ipod/i.test(p) || (/mac/i.test(p) && navigator.maxTouchPoints > 1)) return 'phone'
    if (/win/i.test(p)) return 'win'
    if (/mac/i.test(p)) return 'mac'
    return 'linux'
  })()

  const PRIMARY = {
    linux: ['appimage', 'Baixar para Linux', '.AppImage'],
    win: ['setup', 'Baixar para Windows', 'instalador .exe'],
    mac: [null, 'Downloads', 'sem versão para Mac ainda'],
    phone: [null, 'Downloads', 'Linux e Windows'],
  }

  const card = cardOf('baixar')
  const dl = $('.dl', card)
  const [key, label, ext] = PRIMARY[os]
  $('[data-dl-label]', dl).textContent = label
  $('[data-dl-ext]', dl).textContent = ext
  const sz = $('[data-size]', dl)
  if (key) {
    dl.dataset.asset = key
    sz.dataset.size = key
    dl.href = $(`.alt a[data-asset="${key}"]`, card).href
  } else {
    delete dl.dataset.asset
    dl.href = '#baixar'
    sz.previousSibling.remove()
    sz.remove()
  }
  for (const li of $$('[data-alt]', card)) li.hidden = li.dataset.alt === key

  function release(r) {
    for (const e of $$('[data-version]')) e.textContent = r.tag
    for (const [k, test] of Object.entries(ASSETS)) {
      const a = r.assets.find((x) => test(x.name))
      if (!a) continue
      for (const el of $$(`[data-asset="${k}"]`)) el.href = a.url
      for (const el of $$(`[data-size="${k}"]`)) el.textContent = mb(a.size)
    }
  }

  const cached = keep.get('release', null)
  if (cached?.tag) release(cached)
  if (!cached || Date.now() - cached.at > 3600e3) {
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => {
        const r = { at: Date.now(), tag: j.tag_name, assets: j.assets.map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })) }
        keep.set('release', r)
        release(r)
      })
      .catch(() => {})
  }

  /* ------------------------------------------------------------ início */
  paintQuests()
  counts()
  addTab('como-funciona', false)
  const first = decodeURIComponent(location.hash.slice(1))
  if (first && cardOf(first)) {
    addTab(first, false)
    show(first, true)
  }
  layout()
  addEventListener('resize', () => {
    layout()
    if (cur === 'como-funciona') zoom()
  })
  requestAnimationFrame(() => requestAnimationFrame(() => grid.classList.add('ready')))
})()
