/**
 * main.js  –  Surfers Paradise Kiosk Engine
 *
 * Live data  →  http://127.0.0.1:3000/api/products
 * Fallback   →  products.json  (local mock catalogue)
 */

'use strict';

/* ═══════════════════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════════════════ */
const CFG = {
  USE_API:          true, // 🟢 SWITCH: Set to false to force local products.json
  API_BASE:         'http://127.0.0.1:3000/api',
  MOCK_FILE:        'products.json',
  PAGE_SIZE:        16,
  SEARCH_MIN_CHARS: 3,
  SEARCH_DEBOUNCE:  380,   // ms
  TOAST_DURATION:   2800,  // ms
  QTY_MAX:          99,
};

/* ═══════════════════════════════════════════════════════
   APPLICATION STATE
═══════════════════════════════════════════════════════ */
const state = {
  mockCatalogue:    [],   
  allProducts:      [],   
  cart:             [],   
  currentPage:      1,
  totalPages:       1,
  selectedProduct:  null,
  detailQty:        1,
  searchQuery:      '',
  isSearchMode:     false,
  searchResults:    [],
  toastTimer:       null,
  searchTimer:      null,
};

/* ═══════════════════════════════════════════════════════
   DOM REFS  
═══════════════════════════════════════════════════════ */
let D = {};

function cacheDom() {
  D = {
    grid:           document.getElementById('products-grid'),
    productsScroll: document.getElementById('products-scroll'),
    pagination:     document.getElementById('pagination-bar'),
    searchInput:    document.getElementById('search-input'),
    searchClear:    document.getElementById('search-clear'),
    overlay:        document.getElementById('detail-overlay'),
    detailEmoji:    document.getElementById('detail-emoji'),
    detailName:     document.getElementById('detail-name'),
    detailDesc:     document.getElementById('detail-desc'),
    detailPriceVal: document.getElementById('detail-price-val'),
    qtyVal:         document.getElementById('qty-val'),
    qtyMinus:       document.getElementById('qty-minus'),
    qtyPlus:        document.getElementById('qty-plus'),
    addToCartBtn:   document.getElementById('add-to-cart-btn'),
    detailClose:    document.getElementById('detail-close'),
    cartList:       document.getElementById('cart-items-list'),
    cartBadge:      document.getElementById('cart-badge'),
    cartTotal:      document.getElementById('cart-total-amount'),
    checkoutBtn:    document.getElementById('checkout-btn'),
    toast:          document.getElementById('toast'),
  };
}

/* ═══════════════════════════════════════════════════════
   MOCK CATALOGUE LOADER
═══════════════════════════════════════════════════════ */
async function loadMockCatalogue() {
  if (state.mockCatalogue.length > 0) return state.mockCatalogue;
  try {
    const res  = await fetch(CFG.MOCK_FILE);
    if (!res.ok) throw new Error(`Could not load ${CFG.MOCK_FILE}`);
    const data = await res.json();
    state.mockCatalogue = normalise(data);
  } catch (err) {
    console.error('[Kiosk] Failed to load products.json:', err.message);
    state.mockCatalogue = [];
  }
  return state.mockCatalogue;
}

/* ═══════════════════════════════════════════════════════
   API & DATA FETCHING
═══════════════════════════════════════════════════════ */

async function loadProducts(page = 1) {
  showLoadingSkeleton();

  if (!CFG.USE_API) {
    await applyMockPage(page);
  } else {
    try {
      const res = await fetch(`${CFG.API_BASE}/products`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      // The API returns a flat array. We slice it locally for pagination.
      const normalisedData = normalise(data);
      const start = (page - 1) * CFG.PAGE_SIZE;
      state.allProducts = normalisedData.slice(start, start + CFG.PAGE_SIZE);
      state.totalPages  = Math.ceil(normalisedData.length / CFG.PAGE_SIZE);
      state.currentPage = page;

    } catch (err) {
      console.warn('[Kiosk] API unavailable – falling back to local products.json', err);
      await applyMockPage(page);
    }
  }

  state.isSearchMode = false;
  renderProducts(state.allProducts);
  renderPagination();
}

async function doSearch(query) {
  showLoadingSkeleton();
  const q = query.toLowerCase();

  if (!CFG.USE_API) {
    await executeMockSearch(q);
  } else {
    try {
      const res = await fetch(`${CFG.API_BASE}/products/search?name=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.searchResults = normalise(data);
    } catch (err) {
      console.warn('[Kiosk] Search API unavailable – filtering locally', err);
      await executeMockSearch(q);
    }
  }

  state.isSearchMode = true;
  renderProducts(state.searchResults);
  clearPagination();
}

async function executeMockSearch(q) {
  const catalogue = await loadMockCatalogue();
  state.searchResults = catalogue.filter(p =>
    p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
  );
}

async function applyMockPage(page) {
  const catalogue = await loadMockCatalogue();
  const start = (page - 1) * CFG.PAGE_SIZE;
  state.allProducts = catalogue.slice(start, start + CFG.PAGE_SIZE);
  state.totalPages  = Math.ceil(catalogue.length / CFG.PAGE_SIZE);
  state.currentPage = page;
}

function normalise(arr) {
  return arr.map(p => ({
    id:          p.id,
    name:        p.name        ?? 'Unknown Product',
    price:       parseFloat(p.price ?? 0),
    emoji:       p.emoji       ?? p.icon ?? '📦',
    // Now checks for image_url (API format) in addition to older fallbacks
    image:       p.image_url   ?? p.image ?? p.imageUrl ?? null, 
    category:    p.category    ?? '',
    description: p.description ?? p.desc ?? 'A great product from Surfers Paradise!',
  }));
}

async function findProduct(id) {
  // Check memory first
  const fromPage    = state.allProducts.find(p => p.id === id);
  const fromSearch  = state.searchResults.find(p => p.id === id);
  if (fromPage || fromSearch) return fromPage ?? fromSearch;

  // Fetch individual product if using API
  if (CFG.USE_API) {
      try {
          const res = await fetch(`${CFG.API_BASE}/products/${id}`);
          if (res.ok) return normalise([await res.json()])[0];
      } catch (err) {
          console.warn('[Kiosk] Could not fetch single product from API', err);
      }
  }

  // Last resort: scan local JSON
  const catalogue = await loadMockCatalogue();
  return catalogue.find(p => p.id === id) ?? null;
}

/* ═══════════════════════════════════════════════════════
   RENDER – PRODUCTS
═══════════════════════════════════════════════════════ */

function showLoadingSkeleton() {
  D.grid.innerHTML = `
    <div id="loading-grid">
      ${Array.from({ length: 8 }).map(() => `<div class="skel-card"></div>`).join('')}
    </div>`;
}

function renderProducts(products) {
  if (!products || products.length === 0) {
    D.grid.innerHTML = `
      <div id="no-results-msg">
        <div class="nr-icon">🔍</div>
        <p>No products found for <strong>"${escHtml(state.searchQuery)}"</strong></p>
        <p style="font-size:.78rem;margin-top:4px;">Try a different search term.</p>
      </div>`;
    return;
  }

  D.grid.innerHTML = products.map(p => `
    <div class="product-card"
         role="button"
         tabindex="0"
         aria-label="${escHtml(p.name)} – $${p.price.toFixed(2)}"
         onclick="openDetail(${p.id})"
         onkeydown="if(event.key==='Enter'||event.key===' ')openDetail(${p.id})">
      ${p.image
        ? `<img class="card-img" src="${escHtml(p.image)}" alt="${escHtml(p.name)}" loading="lazy" />`
        : `<div class="card-emoji">${p.emoji}</div>`
      }
      <div class="card-name">${escHtml(p.name)}</div>
      <div class="card-price">$${p.price.toFixed(2)}</div>
    </div>
  `).join('');

  D.productsScroll.scrollTop = 0;
}

/* ═══════════════════════════════════════════════════════
   RENDER – PAGINATION
═══════════════════════════════════════════════════════ */

function renderPagination() {
  const { currentPage: cur, totalPages: tot } = state;
  if (tot <= 1) { clearPagination(); return; }

  const pages = buildPageNumbers(cur, tot);
  let html = '';

  html += `<button class="pg-btn"
                   onclick="goPage(${cur - 1})"
                   ${cur === 1 ? 'disabled' : ''}
                   title="Previous page">
             <i class="fas fa-chevron-left"></i>
           </button>`;

  pages.forEach(p => {
    if (p === '…') {
      html += `<span class="pg-dots">•••</span>`;
    } else {
      html += `<button class="pg-btn ${p === cur ? 'active' : ''}"
                       onclick="goPage(${p})"
                       aria-label="Page ${p}"
                       aria-current="${p === cur ? 'page' : 'false'}">${p}</button>`;
    }
  });

  html += `<button class="pg-btn"
                   onclick="goPage(${cur + 1})"
                   ${cur === tot ? 'disabled' : ''}
                   title="Next page">
             <i class="fas fa-chevron-right"></i>
           </button>`;

  D.pagination.innerHTML = html;
}

function clearPagination() {
  D.pagination.innerHTML = '';
}

function buildPageNumbers(cur, tot) {
  if (tot <= 7) return Array.from({ length: tot }, (_, i) => i + 1);
  if (cur <= 4)       return [1, 2, 3, 4, 5, '…', tot];
  if (cur >= tot - 3) return [1, '…', tot-4, tot-3, tot-2, tot-1, tot];
  return [1, '…', cur-1, cur, cur+1, '…', tot];
}

function goPage(page) {
  if (page < 1 || page > state.totalPages || state.isSearchMode) return;
  loadProducts(page);
}

/* ═══════════════════════════════════════════════════════
   PRODUCT DETAIL  (Page 2 overlay)
═══════════════════════════════════════════════════════ */

async function openDetail(productId) {
  const p = await findProduct(productId);
  if (!p) return;

  state.selectedProduct = p;
  state.detailQty = 1;

  D.detailEmoji.textContent    = p.emoji;
  D.detailName.textContent     = p.name;
  D.detailDesc.textContent     = p.description;
  D.detailPriceVal.textContent = p.price.toFixed(2);
  D.qtyVal.textContent         = '1';
  D.qtyMinus.disabled          = true;
  D.qtyPlus.disabled           = false;

  D.overlay.classList.add('open');
}

function closeDetail() {
  D.overlay.classList.remove('open');
  state.selectedProduct = null;
}

function changeQty(delta) {
  const next = state.detailQty + delta;
  if (next < 1 || next > CFG.QTY_MAX) return;
  state.detailQty      = next;
  D.qtyVal.textContent = next;
  D.qtyMinus.disabled  = next <= 1;
  D.qtyPlus.disabled   = next >= CFG.QTY_MAX;
}

/* ═══════════════════════════════════════════════════════
   CART
═══════════════════════════════════════════════════════ */

function addToCart() {
  const p = state.selectedProduct;
  if (!p) return;

  const existing = state.cart.find(c => c.id === p.id);
  if (existing) {
    existing.qty = Math.min(existing.qty + state.detailQty, CFG.QTY_MAX);
  } else {
    state.cart.push({
      id:    p.id,
      name:  p.name,
      price: p.price,
      emoji: p.emoji,
      qty:   state.detailQty,
    });
  }

  closeDetail();
  renderCart();
  bumpBadge();
  showToast(`${p.emoji}  "${p.name}" added to cart!`);
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(c => c.id !== productId);
  renderCart();
}

function renderCart() {
  const totalItems = state.cart.reduce((s, c) => s + c.qty,            0);
  const totalPrice = state.cart.reduce((s, c) => s + c.price * c.qty,  0);

  D.cartBadge.textContent = totalItems;
  D.cartTotal.textContent = `$${totalPrice.toFixed(2)}`;

  if (state.cart.length === 0) {
    D.cartList.innerHTML = `
      <div id="empty-cart-msg">
        <div class="ec-icon">🛒</div>
        <p>Your cart is empty.<br/>Tap a product to get started!</p>
      </div>`;
    return;
  }

  D.cartList.innerHTML = state.cart.map(c => `
    <div class="cart-item" id="ci-${c.id}">
      <div class="cart-item-row1">
        <span class="cart-item-emoji">${c.emoji}</span>
        <span class="cart-item-name">${escHtml(c.name)}</span>
        <button class="cart-delete-btn"
                onclick="removeFromCart(${c.id})"
                title="Remove ${escHtml(c.name)}">
          <i class="fas fa-trash-can"></i>
        </button>
      </div>
      <div class="cart-item-row2">
        <span class="cart-item-qty-price">${c.qty} × $${c.price.toFixed(2)}</span>
        <span class="cart-item-subtotal">$${(c.price * c.qty).toFixed(2)}</span>
      </div>
    </div>
  `).join('');
}

function bumpBadge() {
  D.cartBadge.classList.remove('bump');
  void D.cartBadge.offsetWidth;         
  D.cartBadge.classList.add('bump');
}

/* ═══════════════════════════════════════════════════════
   SEARCH
═══════════════════════════════════════════════════════ */

function handleSearchInput(e) {
  const q = e.target.value.trim();
  state.searchQuery = q;

  D.searchClear.classList.toggle('visible', q.length > 0);
  clearTimeout(state.searchTimer);

  if (q.length === 0) {
    state.isSearchMode = false;
    loadProducts(1);
    return;
  }

  if (q.length < CFG.SEARCH_MIN_CHARS) return;

  state.searchTimer = setTimeout(() => doSearch(q), CFG.SEARCH_DEBOUNCE);
}

function clearSearch() {
  D.searchInput.value = '';
  D.searchClear.classList.remove('visible');
  state.searchQuery  = '';
  state.isSearchMode = false;
  clearTimeout(state.searchTimer);
  loadProducts(1);
  D.searchInput.focus();
}

/* ═══════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════ */

function showToast(msg) {
  clearTimeout(state.toastTimer);
  D.toast.textContent = msg;
  D.toast.classList.add('visible');
  state.toastTimer = setTimeout(
    () => D.toast.classList.remove('visible'),
    CFG.TOAST_DURATION
  );
}

/* ═══════════════════════════════════════════════════════
   UTILITY
═══════════════════════════════════════════════════════ */

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

/* ═══════════════════════════════════════════════════════
   EVENT WIRING
═══════════════════════════════════════════════════════ */

function bindEvents() {
  D.searchInput.addEventListener('input',  handleSearchInput);
  D.searchClear.addEventListener('click',  clearSearch);

  D.qtyMinus.addEventListener('click',     () => changeQty(-1));
  D.qtyPlus.addEventListener('click',      () => changeQty(+1));

  D.addToCartBtn.addEventListener('click', addToCart);

  D.detailClose.addEventListener('click',  closeDetail);
  D.overlay.addEventListener('click', e => {
    if (e.target === D.overlay) closeDetail();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && D.overlay.classList.contains('open')) closeDetail();
  });

  D.checkoutBtn.addEventListener('click', () => {
    if (state.cart.length === 0) {
      showToast('🛒  Your cart is empty!');
      return;
    }
    showToast('💳  Redirecting to payment terminal…');
  });
}

/* ═══════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  cacheDom();
  bindEvents();
  renderCart();

  // Pre-warm the mock catalogue in the background
  loadMockCatalogue();

  await loadProducts(1);
});