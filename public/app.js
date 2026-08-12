/* ── Six Degrees frontend (vanilla JS, no build step) ────────────────── */

const view = document.getElementById('view')

/* ── helpers ─────────────────────────────────────────────────────────── */

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const AVATAR_COLORS = ['#4f46e5', '#7c3aed', '#db2777', '#e11d48', '#ea580c', '#16a34a', '#0d9488', '#2563eb']
const avatarColor = (id) => AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length]
const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

const avatar = (user, size = 'md') =>
  `<span class="avatar avatar-${size}" style="background:${avatarColor(user.id)}" title="${esc(user.name)}">${esc(initials(user.name))}</span>`

function api(path, { method = 'GET' } = {}) {
  return fetch(path, { method, headers: { Accept: 'application/json' } }).then(async (res) => {
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(body.message || `Request failed (${res.status})`)
      err.status = res.status
      err.detail = body.detail
      throw err
    }
    return body
  })
}

const loading = (kind) => {
  if (kind === 'hero') {
    return `<div class="profile-hero"><span class="skeleton sk-avatar"></span><div style="flex:1"><span class="skeleton sk-line" style="width:40%"></span><span class="skeleton sk-line" style="width:65%"></span><span class="skeleton sk-line" style="width:50%"></span></div></div>`
  }
  if (kind === 'cards') {
    return `<div class="person-grid">${Array.from({ length: 8 }, () => '<div class="skeleton sk-card"></div>').join('')}</div>`
  }
  return `<div class="card" style="padding:20px">${Array.from({ length: 6 }, () => '<div class="skeleton sk-row" style="margin-bottom:10px"></div>').join('')}</div>`
}

function stateView({ icon = '🛰️', title, text, action = '' }) {
  return `<div class="state"><span class="state-icon" aria-hidden="true">${icon}</span><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`
}

function errorView(err, { retry } = {}) {
  const dbDown = err.status === 503 || /database|graph db|unreachable/i.test(err.message)
  const timedOut = err.status === 504
  const title = timedOut ? 'The database is slow' : dbDown ? "Can't reach the graph database" : 'Something went wrong'
  const text = timedOut
    ? err.message || 'That query took too long. Try a less connected person, or retry.'
    : dbDown
      ? 'The app is running, but the database isn’t answering. Check your .env credentials and that your CognoDB instance (or local Neo4j) is up.'
      : err.message || 'An unexpected error occurred.'
  return `<div class="state state-error"><span class="state-icon" aria-hidden="true">${timedOut ? '⏳' : dbDown ? '🔌' : '😵'}</span><h3>${title}</h3><p>${esc(text)}</p>${
    retry ? `<button class="btn" onclick="${retry}">Try again</button>` : ''
  }</div>`
}

const personCard = (u) => `
  <a class="person-card" href="#/user/${u.id}">
    <div class="person-card-top">${avatar(u, 'md')}<div style="min-width:0"><div class="person-card-name">${esc(u.name)}</div><div class="person-card-meta">${esc(u.city || '')}${u.job ? ` · ${esc(u.job)}` : ''}</div></div></div>
    <div class="person-card-foot">👥 ${u.degree ?? 0} connections</div>
  </a>`

const mutualBadge = (n) => (n > 0 ? `<span class="badge badge-mutual">🤝 ${n} mutual friend${n === 1 ? '' : 's'}</span>` : '')

/* ── health banner ───────────────────────────────────────────────────── */

const banner = document.getElementById('db-banner')
const bannerText = document.getElementById('db-banner-text')

async function refreshHealth(showBanner = true) {
  try {
    const res = await fetch('/api/health')
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.status === 'ok') {
      banner.hidden = true
      return true
    }
    throw new Error(body.detail || 'unreachable')
  } catch (err) {
    if (showBanner) {
      bannerText.textContent = "Can't reach the graph database — showing cached pages, live queries unavailable."
      banner.hidden = false
    }
    return false
  }
}

document.getElementById('db-banner-retry').addEventListener('click', async () => {
  bannerText.textContent = 'Retrying…'
  const ok = await refreshHealth(true)
  if (ok) banner.hidden = true
  router()
})

/* ── global search ───────────────────────────────────────────────────── */

const searchForm = document.getElementById('global-search')
const searchInput = document.getElementById('global-search-input')
const suggestionsBox = document.getElementById('search-suggestions')

let searchTimer = null

function closeSuggestions() {
  suggestionsBox.hidden = true
  suggestionsBox.innerHTML = ''
}

function openSuggestions(html) {
  suggestionsBox.innerHTML = html
  suggestionsBox.hidden = false
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer)
  const q = searchInput.value.trim()
  if (!q) return closeSuggestions()
  searchTimer = setTimeout(async () => {
    try {
      const { results } = await api(`/api/users/search?q=${encodeURIComponent(q)}&limit=6`)
      if (!results.length) {
        openSuggestions(`<div class="search-suggestion-empty">No matches for “${esc(q)}”. <a href="#/search?q=${encodeURIComponent(q)}">Search all results →</a></div>`)
        return
      }
      openSuggestions(
        results
          .map(
            (u) =>
              `<button type="button" class="search-suggestion" data-id="${u.id}">
                 ${avatar(u, 'sm')}
                 <span><span class="suggestion-name">${esc(u.name)}</span><br><span class="suggestion-meta">${esc(u.city || '')} · ${u.degree} connections</span></span>
               </button>`,
          )
          .join(''),
      )
    } catch {
      /* ignore — health banner covers DB issues */
    }
  }, 180)
})

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    const q = searchInput.value.trim()
    closeSuggestions()
    if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`
  }
  if (e.key === 'Escape') closeSuggestions()
})

searchForm.addEventListener('click', (e) => {
  const btn = e.target.closest('.search-suggestion')
  if (!btn) return
  location.hash = `#/user/${btn.dataset.id}`
  closeSuggestions()
})

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search')) closeSuggestions()
})

/* ── router ──────────────────────────────────────────────────────────── */

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '')
  const [path, query] = hash.split('?')
  const params = new URLSearchParams(query || '')
  return { path: path || '', params }
}

function router() {
  const { path, params } = parseHash()
  const segments = path.split('/').filter(Boolean)
  closeSuggestions()

  if (segments.length === 0) return renderHome()
  if (segments[0] === 'explore') return renderExplore(params)
  if (segments[0] === 'search') return renderSearch(params.get('q') || '')
  if (segments[0] === 'user' && segments[1]) return renderUser(segments[1])
  return renderNotFound()
}

window.addEventListener('hashchange', router)

/* ── home ────────────────────────────────────────────────────────────── */

async function renderHome() {
  view.innerHTML = `
    <section class="hero">
      <h1>Find the people you're <span class="gradient">one hop away</span> from.</h1>
      <p>Six Degrees is a friend-of-friend recommender. Pick a person and discover the
      friends of their friends you don't know yet — ranked by how many mutual friends you share.</p>
      <form class="search hero-search" id="hero-search" role="search" autocomplete="off">
        <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg>
        <input id="hero-search-input" type="search" placeholder="Search 4,000+ people… try “Maya”" aria-label="Search for a person" />
        <div id="hero-suggestions" class="search-suggestions" hidden></div>
      </form>
      <div class="stats">
        <div class="stat"><div class="stat-value" id="stat-users">—</div><div class="stat-label">people in the network</div></div>
        <div class="stat"><div class="stat-value" id="stat-friendships">—</div><div class="stat-label">friendships</div></div>
        <div class="stat"><div class="stat-value" id="stat-avg">—</div><div class="stat-label">avg. connections / person</div></div>
        <div class="stat"><div class="stat-value" id="stat-max">—</div><div class="stat-label">most friends anyone has</div></div>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2 class="section-title">Most connected people</h2><span class="section-sub">start exploring from a well-connected hub</span></div>
      <div id="home-top" class="person-grid">${loading('cards')}</div>
    </section>`

  // Wire the hero search (duplicate of the global one, but centered)
  const heroForm = document.getElementById('hero-search')
  const heroInput = document.getElementById('hero-search-input')
  const heroSug = document.getElementById('hero-suggestions')
  let heroTimer = null
  heroInput.addEventListener('input', () => {
    clearTimeout(heroTimer)
    const q = heroInput.value.trim()
    if (!q) { heroSug.hidden = true; return }
    heroTimer = setTimeout(async () => {
      try {
        const { results } = await api(`/api/users/search?q=${encodeURIComponent(q)}&limit=6`)
        heroSug.innerHTML = results.length
          ? results.map((u) => `<button type="button" class="search-suggestion" data-id="${u.id}">${avatar(u, 'sm')}<span><span class="suggestion-name">${esc(u.name)}</span><br><span class="suggestion-meta">${esc(u.city || '')} · ${u.degree} connections</span></span></button>`).join('')
          : `<div class="search-suggestion-empty">No matches for “${esc(q)}”.</div>`
        heroSug.hidden = false
      } catch { /* ignore */ }
    }, 180)
  })
  heroInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const q = heroInput.value.trim(); if (q) location.hash = `#/search?q=${encodeURIComponent(q)}` }
    if (e.key === 'Escape') heroSug.hidden = true
  })
  heroForm.addEventListener('click', (e) => {
    const btn = e.target.closest('.search-suggestion')
    if (btn) { location.hash = `#/user/${btn.dataset.id}`; heroSug.hidden = true }
  })

  // Stats + top users in parallel
  const [stats, top] = await Promise.all([
    api('/api/stats').catch(() => null),
    api('/api/top?limit=8').catch(() => null),
  ])

  if (stats) {
    document.getElementById('stat-users').textContent = stats.users.toLocaleString()
    document.getElementById('stat-friendships').textContent = stats.friendships.toLocaleString()
    document.getElementById('stat-avg').textContent = stats.avgDegree
    document.getElementById('stat-max').textContent = stats.maxDegree.toLocaleString()
  }

  const topEl = document.getElementById('home-top')
  if (!top) {
    topEl.innerHTML = stateView({ icon: '🔌', title: "Can't load the network", text: 'The database isn’t reachable right now.', action: '<button class="btn" onclick="location.hash=\'\';location.reload()">Retry</button>' })
  } else if (!top.users.length) {
    topEl.innerHTML = stateView({
      icon: '🌱',
      title: 'The database is empty',
      text: 'No users found. Load the dataset with “npm run seed” once your database is reachable.',
    })
  } else {
    topEl.innerHTML = top.users.map(personCard).join('')
  }
}

/* ── user profile ────────────────────────────────────────────────────── */

function userTabs(active, userId) {
  return `<div class="tabs" role="tablist">
    <button class="tab ${active === 'suggestions' ? 'active' : ''}" data-tab="suggestions" role="tab">Suggestions for you</button>
    <button class="tab ${active === 'friends' ? 'active' : ''}" data-tab="friends" role="tab">Friends</button>
    <button class="tab ${active === 'degrees' ? 'active' : ''}" data-tab="degrees" role="tab">Degrees of separation</button>
  </div>`
}

async function renderUser(idRaw) {
  const id = Number(idRaw)
  view.innerHTML = `
    <a class="back-link" href="#/">← Back to home</a>
    <div id="user-hero">${loading('hero')}</div>
    <div id="user-tabs"></div>
    <div id="user-panel">${loading()}</div>`

  let user
  try {
    const data = await api(`/api/users/${id}`)
    user = data.user
  } catch (err) {
    document.getElementById('user-hero').innerHTML = errorView(err, { retry: `location.hash='#/user/${idRaw}'` })
    return
  }

  document.getElementById('user-hero').innerHTML = `
    <div class="profile-hero">
      ${avatar(user, 'lg')}
      <div class="profile-info">
        <h2>${esc(user.name)}</h2>
        <div class="role">${esc(user.city || 'Unknown city')}${user.job ? ` · ${esc(user.job)}` : ''}${user.age ? ` · ${user.age}` : ''}</div>
        ${user.interests && user.interests.length ? `<div class="profile-chips">${user.interests.map((i) => `<span class="chip">${esc(i)}</span>`).join('')}</div>` : ''}
        <div class="profile-stats">
          <span class="badge">👥 ${user.degree} connections</span>
          <span class="badge badge-muted">ID #${user.id}</span>
        </div>
      </div>
    </div>`

  document.getElementById('user-tabs').innerHTML = userTabs('suggestions', user.id)
  document.getElementById('user-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab')
    if (!tab) return
    switchTab(tab.dataset.tab, user.id)
  })

  await renderPanel('suggestions', user)
}

async function switchTab(tab, userId) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab))
  await renderPanel(tab, { id: userId })
}

async function renderPanel(tab, user) {
  const panel = document.getElementById('user-panel')
  panel.innerHTML = loading()

  if (tab === 'suggestions') return renderSuggestions(panel, user)
  if (tab === 'friends') return renderFriends(panel, user)
  return renderDegrees(panel, user)
}

async function renderSuggestions(panel, user) {
  let data
  try {
    data = await api(`/api/users/${user.id}/recommendations?limit=20`)
  } catch (err) {
    panel.innerHTML = errorView(err, { retry: `switchTab('suggestions', ${user.id})` })
    return
  }

  if (!data.recommendations.length) {
    panel.innerHTML = stateView({
      icon: '🎉',
      title: 'No new suggestions',
      text: `${user.name} is already connected to everyone reachable within two hops — or knows everyone in the network. Try someone else!`,
    })
    return
  }

  panel.innerHTML = `
    <div class="section-head"><h2 class="section-title">People you may know</h2><span class="section-sub">friends-of-friends ranked by shared connections</span></div>
    <div class="rec-list">
      ${data.recommendations
        .map(
          (r, i) => `
        <a class="rec-row" href="#/user/${r.user.id}">
          <span class="rec-rank">${i + 1}</span>
          ${avatar(r.user, 'md')}
          <div class="rec-main">
            <div class="rec-name">${esc(r.user.name)}</div>
            <div class="rec-meta">${esc(r.user.city || '')}${r.user.job ? ` · ${esc(r.user.job)}` : ''}</div>
          </div>
          <div class="rec-badges">${mutualBadge(r.mutualCount)}<span class="badge badge-muted">👥 ${r.user.degree} connections</span></div>
        </a>`,
        )
        .join('')}
    </div>`
}

async function renderFriends(panel, user) {
  let data
  try {
    data = await api(`/api/users/${user.id}/friends?limit=96`)
  } catch (err) {
    panel.innerHTML = errorView(err, { retry: `switchTab('friends', ${user.id})` })
    return
  }
  if (!data.friends.length) {
    panel.innerHTML = stateView({ icon: '🤷', title: 'No friends yet', text: `${user.name} has no connections in this network.` })
    return
  }
  panel.innerHTML = `
    <div class="section-head"><h2 class="section-title">Friends (${data.friends.length} shown)</h2><span class="section-sub">${user.degree} total connections</span></div>
    <div class="person-grid">${data.friends.map(personCard).join('')}</div>`
}

async function renderDegrees(panel, user) {
  panel.innerHTML = `
    <div class="section-head"><h2 class="section-title">Degrees of separation</h2><span class="section-sub">shortest path through the friendship graph</span></div>
    <div class="card" style="padding:20px">
      <form class="field" id="degrees-form" style="max-width:100%">
        <label for="degrees-target">How is <strong>${esc(user.name)}</strong> connected to…?</label>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <input id="degrees-target" list="degrees-datalist" placeholder="Type a name to search" style="flex:1;min-width:220px" />
          <datalist id="degrees-datalist"></datalist>
          <button class="btn" type="submit">Find the path</button>
        </div>
      </form>
      <div id="degrees-result" style="margin-top:18px"></div>
    </div>`

  const input = document.getElementById('degrees-target')
  const datalist = document.getElementById('degrees-datalist')
  let timer = null
  input.addEventListener('input', () => {
    clearTimeout(timer)
    const q = input.value.trim()
    if (q.length < 2) { datalist.innerHTML = ''; return }
    timer = setTimeout(async () => {
      try {
        const { results } = await api(`/api/users/search?q=${encodeURIComponent(q)}&limit=10`)
        datalist.innerHTML = results
          .filter((r) => r.id !== user.id)
          .map((r) => `<option value="${esc(r.name)} (id ${r.id})"></option>`)
          .join('')
      } catch { /* ignore */ }
    }, 200)
  })

  document.getElementById('degrees-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const raw = input.value.trim()
    const idMatch = raw.match(/\(id (\d+)\)$/)
    const targetId = idMatch ? Number(idMatch[1]) : null
    if (targetId === null) {
      document.getElementById('degrees-result').innerHTML = stateView({ icon: '🔎', title: 'Pick a person', text: 'Choose a person from the suggestions, then submit.' })
      return
    }
    const result = document.getElementById('degrees-result')
    result.innerHTML = loading()
    try {
      const data = await api(`/api/users/${user.id}/path/${targetId}`)
      if (!data.found) {
        result.innerHTML = stateView({ icon: '🕳️', title: 'No connection within 8 hops', text: 'These two people aren’t linked through the friendship graph within the search depth.' })
        return
      }
      if (data.degrees === 0) {
        result.innerHTML = stateView({ icon: '🙃', title: 'That’s the same person', text: 'You picked the person you started from.' })
        return
      }
      const steps = data.path.map(
        (u) => `
        <div class="chain-step">
          <a href="#/user/${u.id}">${avatar(u, 'md')}</a>
          <span class="chain-step-name">${esc(u.name)}</span>
        </div>`,
      )
      result.innerHTML = `
        <div style="text-align:center;margin-bottom:14px">
          <span class="badge badge-mutual" style="font-size:14px;padding:6px 16px">${data.degrees} degree${data.degrees === 1 ? '' : 's'} of separation</span>
        </div>
        <div class="chain">${steps.join('<span class="chain-arrow">→</span>')}</div>
        <p style="text-align:center;color:var(--ink-3);font-size:13px">Every hop is a real friendship — ${data.degrees} ${data.degrees === 1 ? 'friend' : 'intermediaries'} bridge${data.degrees === 1 ? 's' : ''} the gap.</p>`
    } catch (err) {
      result.innerHTML = errorView(err, { retry: '' })
    }
  })
}

/* ── search results ──────────────────────────────────────────────────── */

async function renderSearch(q) {
  view.innerHTML = `
    <div class="section-head"><h2 class="section-title">Results for “${esc(q)}”</h2></div>
    <div id="search-results" class="result-list">${loading()}</div>`

  let data
  try {
    data = await api(`/api/users/search?q=${encodeURIComponent(q)}&limit=20`)
  } catch (err) {
    document.getElementById('search-results').innerHTML = errorView(err, { retry: `location.hash='#/search?q=${encodeURIComponent(q)}'` })
    return
  }
  const el = document.getElementById('search-results')
  if (!data.results.length) {
    el.innerHTML = stateView({ icon: '🔍', title: 'No matches', text: `Nothing came back for “${q}”. Try a name like “Maya” or “Kiran”, or a user id.` })
    return
  }
  el.innerHTML = data.results
    .map(
      (u) => `
    <a class="result-row" href="#/user/${u.id}">
      ${avatar(u, 'md')}
      <div style="min-width:0">
        <div class="result-name">${esc(u.name)}</div>
        <div class="result-meta">${esc(u.city || '')}${u.job ? ` · ${esc(u.job)}` : ''} · ${u.degree} connections</div>
      </div>
      <span class="badge badge-muted" style="margin-left:auto">ID ${u.id}</span>
    </a>`,
    )
    .join('')
}

/* ── explore ─────────────────────────────────────────────────────────── */

async function renderExplore(params) {
  const q = params.get('q')
  if (q) return renderSearch(q)
  view.innerHTML = `
    <div class="section-head"><h2 class="section-title">Explore the network</h2><span class="section-sub">a few well-connected people to start from</span></div>
    <div id="explore-grid" class="person-grid">${loading('cards')}</div>`
  try {
    const data = await api('/api/top?limit=24')
    const el = document.getElementById('explore-grid')
    if (!data.users.length) {
      el.innerHTML = stateView({ icon: '🌱', title: 'The database is empty', text: 'Run “npm run seed” to load the dataset.' })
    } else {
      el.innerHTML = data.users.map(personCard).join('')
    }
  } catch (err) {
    document.getElementById('explore-grid').innerHTML = errorView(err, { retry: `location.hash='#/explore'` })
  }
}

/* ── misc routes ─────────────────────────────────────────────────────── */

function renderNotFound() {
  view.innerHTML = stateView({
    icon: '🧭',
    title: 'Page not found',
    text: 'That page doesn’t exist. Head back home and search for someone.',
    action: '<a class="btn" href="#/">Go home</a>',
  })
}

/* ── boot ────────────────────────────────────────────────────────────── */

refreshHealth(true)
router()

// Keep the banner honest: re-check periodically so it clears as soon as the
// DB recovers and reappears if it goes down mid-session, instead of only
// being evaluated once at page load.
setInterval(() => refreshHealth(true), 10_000)
