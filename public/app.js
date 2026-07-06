const state = {
  user: null,
  view: "dashboard",
  authMode: "login",
  products: [],
  dashboard: null,
  search: "",
  editingProduct: null,
  toastTimer: null
};

const app = document.querySelector("#app");

const icons = {
  dashboard: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 13h7V4H4v9Zm0 7h7v-5H4v5Zm9 0h7v-9h-7v9Zm0-16v5h7V4h-7Z" fill="currentColor"/></svg>',
  products: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m12 2 8 4.5v9L12 20l-8-4.5v-9L12 2Zm0 2.3L6.3 7.5 12 10.7l5.7-3.2L12 4.3Zm-6 5v5.1l5 2.8v-5.1L6 9.3Zm7 7.9 5-2.8V9.3l-5 2.8v5.1Z" fill="currentColor"/></svg>',
  settings: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.5-2.4 1a7 7 0 0 0-2.6-1.5L14 2h-4l-.4 3a7 7 0 0 0-2.6 1.5l-2.4-1-2 3.5 2 1.5c-.1.5-.1 1-.1 1.5s0 1 .1 1.5l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 2.6 1.5l.4 3h4l.4-3a7 7 0 0 0 2.6-1.5l2.4 1 2-3.5-2-1.5ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" fill="currentColor"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" fill="currentColor"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M4 17.3V20h2.7L17.8 8.9l-2.7-2.7L4 17.3ZM19.7 7a1 1 0 0 0 0-1.4l-1.3-1.3a1 1 0 0 0-1.4 0l-1 1 2.7 2.7 1-1Z" fill="currentColor"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M7 21c-1.1 0-2-.9-2-2V8h14v11c0 1.1-.9 2-2 2H7ZM9 4h6l1 2h4v2H4V6h4l1-2Z" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4 6.4 5Zm12.6 1.4L6.4 19 5 17.6 17.6 5 19 6.4Z" fill="currentColor"/></svg>'
};

function money(value) {
  return Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.details = data;
    throw error;
  }
  return data;
}

function toast(message) {
  clearTimeout(state.toastTimer);
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  state.toastTimer = setTimeout(() => node.remove(), 2800);
}

function setView(view) {
  state.view = view;
  renderApp();
  refreshData();
}

function render() {
  if (!state.user) {
    renderAuth();
    return;
  }
  renderApp();
}

function renderAuth(errors = {}, message = "") {
  const isSignup = state.authMode === "signup";
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-brand">
        <div class="brand-mark"><span class="brand-icon">${icons.products}</span> StockFlow</div>
        <div>
          <h1>Inventory that stays honest.</h1>
          <p>Track products, quantities, prices, and low-stock pressure in a focused SaaS workspace.</p>
        </div>
      </section>
      <section class="auth-panel">
        <form class="auth-card" id="authForm" novalidate>
          <div class="auth-tabs" role="tablist">
            <button type="button" class="tab ${!isSignup ? "active" : ""}" data-auth-mode="login">Login</button>
            <button type="button" class="tab ${isSignup ? "active" : ""}" data-auth-mode="signup">Signup</button>
          </div>
          <div class="form-error">${escapeHtml(message)}</div>
          ${isSignup ? field("organizationName", "Organization name", "My Test Store", errors.organizationName) : ""}
          ${field("email", "Email", "owner@example.com", errors.email, "email")}
          ${field("password", "Password", "At least 8 characters", errors.password, "password")}
          ${isSignup ? field("confirmPassword", "Confirm password", "Repeat password", errors.confirmPassword, "password") : ""}
          <button class="btn" type="submit">${isSignup ? "Create account" : "Log in"}</button>
        </form>
      </section>
    </main>
  `;

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      renderAuth();
    });
  });
  document.querySelector("#authForm").addEventListener("submit", submitAuth);
}

function field(name, label, placeholder, error = "", type = "text", value = "") {
  return `
    <div class="field">
      <label for="${name}">${label}</label>
      <input id="${name}" name="${name}" type="${type}" placeholder="${placeholder}" value="${escapeHtml(value)}">
      <div class="field-error">${escapeHtml(error)}</div>
    </div>
  `;
}

async function submitAuth(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const body = Object.fromEntries(form.entries());
  try {
    const data = await api(`/api/${state.authMode}`, { method: "POST", body });
    state.user = data.user;
    state.view = "dashboard";
    renderApp();
    await refreshData();
  } catch (error) {
    renderAuth(error.details?.errors || {}, error.message);
  }
}

function renderApp() {
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand-mark"><span class="brand-icon">${icons.products}</span> StockFlow</div>
        <div class="org">
          <span>Organization</span>
          <strong>${escapeHtml(state.user.organization.name)}</strong>
        </div>
        <nav class="nav">
          ${navButton("dashboard", "Dashboard", icons.dashboard)}
          ${navButton("products", "Products", icons.products)}
          ${navButton("settings", "Settings", icons.settings)}
        </nav>
        <div class="sidebar-footer">
          <span>${escapeHtml(state.user.email)}</span>
          <button class="btn secondary" id="logoutButton">Log out</button>
        </div>
      </aside>
      <main class="main">
        ${state.view === "dashboard" ? dashboardView() : ""}
        ${state.view === "products" ? productsView() : ""}
        ${state.view === "settings" ? settingsView() : ""}
      </main>
    </div>
  `;

  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelector("#logoutButton").addEventListener("click", logout);

  if (state.view === "products") bindProducts();
  if (state.view === "settings") bindSettings();
}

function navButton(view, label, icon) {
  return `<button type="button" class="${state.view === view ? "active" : ""}" data-view="${view}">${icon}<span>${label}</span></button>`;
}

function dashboardView() {
  const dash = state.dashboard || { totalProducts: 0, totalQuantity: 0, inventoryValue: 0, lowStockItems: [] };
  return `
    <header class="topbar">
      <div>
        <span class="eyebrow">Dashboard</span>
        <h1>Inventory overview</h1>
      </div>
      <button class="btn" type="button" onclick="setView('products')">${icons.plus} Add product</button>
    </header>
    <section class="metrics">
      <div class="metric"><span class="eyebrow">Products</span><strong>${dash.totalProducts}</strong></div>
      <div class="metric"><span class="eyebrow">Units on hand</span><strong>${dash.totalQuantity}</strong></div>
      <div class="metric"><span class="eyebrow">Retail value</span><strong>${money(dash.inventoryValue)}</strong></div>
    </section>
    <section class="panel">
      <div class="panel-header">
        <h2>Low stock items</h2>
        <span class="badge low">${dash.lowStockItems.length} flagged</span>
      </div>
      ${table(dash.lowStockItems, ["Name", "SKU", "Quantity", "Threshold"], (product) => `
        <td>${escapeHtml(product.name)}</td>
        <td class="sku">${escapeHtml(product.sku)}</td>
        <td class="quantity">${product.quantityOnHand}</td>
        <td class="quantity">${product.effectiveLowStockThreshold}</td>
      `, "No low-stock items right now.")}
    </section>
  `;
}

function productsView() {
  const query = state.search.trim().toLowerCase();
  const products = state.products.filter((product) => !query || product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query));
  return `
    <header class="topbar">
      <div>
        <span class="eyebrow">Products</span>
        <h1>Product inventory</h1>
      </div>
      <div class="toolbar">
        <input class="search" id="productSearch" placeholder="Search name or SKU" value="${escapeHtml(state.search)}">
        <button class="btn" type="button" id="addProduct">${icons.plus} Add product</button>
      </div>
    </header>
    <section class="panel">
      <div class="panel-header">
        <h2>${products.length} products</h2>
        <span class="eyebrow">Scoped to ${escapeHtml(state.user.organization.name)}</span>
      </div>
      ${table(products, ["Name", "SKU", "Quantity", "Low stock", "Selling price", ""], (product) => `
        <td>
          <strong>${escapeHtml(product.name)}</strong>
          ${product.description ? `<br><span class="eyebrow">${escapeHtml(product.description)}</span>` : ""}
        </td>
        <td class="sku">${escapeHtml(product.sku)}</td>
        <td class="quantity">${product.quantityOnHand}</td>
        <td><span class="badge ${product.isLowStock ? "low" : "ok"}">${product.isLowStock ? "Low stock" : "Healthy"}</span></td>
        <td class="money">${product.sellingPrice == null ? "-" : money(product.sellingPrice)}</td>
        <td>
          <div class="actions">
            <button class="btn secondary icon" title="Edit product" data-edit="${product.id}">${icons.edit}</button>
            <button class="btn danger icon" title="Delete product" data-delete="${product.id}">${icons.trash}</button>
          </div>
        </td>
      `, "No products yet. Add the first SKU to start tracking stock.")}
    </section>
  `;
}

function table(rows, headings, rowTemplate, emptyText) {
  if (!rows.length) return `<div class="empty">${emptyText}</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headings.map((heading) => `<th>${heading}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${rowTemplate(row)}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function settingsView(errors = {}) {
  return `
    <header class="topbar">
      <div>
        <span class="eyebrow">Settings</span>
        <h1>Stock rules</h1>
      </div>
    </header>
    <section class="panel settings-panel">
      <div class="panel-header">
        <h2>Default low stock threshold</h2>
      </div>
      <form class="modal-body" id="settingsForm">
        ${field("defaultLowStockThreshold", "Default threshold", "5", errors.defaultLowStockThreshold, "number", state.user.organization.defaultLowStockThreshold)}
        <button class="btn" type="submit">Save settings</button>
      </form>
    </section>
  `;
}

function bindProducts() {
  document.querySelector("#addProduct").addEventListener("click", () => openProductModal());
  document.querySelector("#productSearch").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderApp();
  });
  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openProductModal(state.products.find((product) => product.id === button.dataset.edit)));
  });
  document.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteProduct(button.dataset.delete)));
}

function openProductModal(product = null, errors = {}) {
  state.editingProduct = product;
  const values = product || { name: "", sku: "", description: "", quantityOnHand: 0, costPrice: "", sellingPrice: "", lowStockThreshold: "" };
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <form class="modal" id="productForm" novalidate>
      <div class="modal-header">
        <h2>${product ? "Edit product" : "Add product"}</h2>
        <button type="button" class="btn secondary icon" id="closeModal" title="Close">${icons.close}</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          ${field("name", "Name", "Organic coffee beans", errors.name, "text", values.name)}
          ${field("sku", "SKU", "COF-001", errors.sku, "text", values.sku)}
          ${field("quantityOnHand", "Quantity on hand", "25", errors.quantityOnHand, "number", values.quantityOnHand)}
          ${field("lowStockThreshold", "Low stock threshold", `Default ${state.user.organization.defaultLowStockThreshold}`, errors.lowStockThreshold, "number", values.lowStockThreshold ?? "")}
          ${field("costPrice", "Cost price", "8.50", errors.costPrice, "number", values.costPrice ?? "")}
          ${field("sellingPrice", "Selling price", "14.99", errors.sellingPrice, "number", values.sellingPrice ?? "")}
          <div class="field wide">
            <label for="description">Description</label>
            <textarea id="description" name="description" placeholder="Optional notes">${escapeHtml(values.description || "")}</textarea>
            <div class="field-error">${escapeHtml(errors.description || "")}</div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn secondary" id="cancelModal">Cancel</button>
        <button class="btn" type="submit">${product ? "Save product" : "Create product"}</button>
      </div>
    </form>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#closeModal").addEventListener("click", closeModal);
  modal.querySelector("#cancelModal").addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  modal.querySelector("#productForm").addEventListener("submit", submitProduct);
}

function closeModal() {
  document.querySelector(".modal-backdrop")?.remove();
  state.editingProduct = null;
}

async function submitProduct(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget).entries());
  const product = state.editingProduct;
  try {
    await api(product ? `/api/products/${product.id}` : "/api/products", {
      method: product ? "PUT" : "POST",
      body
    });
    closeModal();
    toast(product ? "Product updated." : "Product created.");
    await refreshData();
  } catch (error) {
    document.querySelector(".modal-backdrop")?.remove();
    openProductModal(product, error.details?.errors || {});
  }
}

async function deleteProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product || !confirm(`Delete ${product.name}?`)) return;
  await api(`/api/products/${id}`, { method: "DELETE" });
  toast("Product deleted.");
  await refreshData();
}

function bindSettings() {
  document.querySelector("#settingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const data = await api("/api/settings", { method: "PUT", body });
      state.user.organization.defaultLowStockThreshold = data.setting.defaultLowStockThreshold;
      toast("Settings saved.");
      await refreshData();
    } catch (error) {
      document.querySelector(".main").innerHTML = settingsView(error.details?.errors || {});
      bindSettings();
    }
  });
}

async function refreshData() {
  if (!state.user) return;
  const [dashboardData, productData] = await Promise.all([
    api("/api/dashboard"),
    api("/api/products")
  ]);
  state.dashboard = dashboardData;
  state.products = productData.products;
  renderApp();
}

async function logout() {
  await api("/api/logout", { method: "POST" });
  state.user = null;
  state.products = [];
  state.dashboard = null;
  render();
}

async function init() {
  try {
    const data = await api("/api/me");
    state.user = data.user;
    renderApp();
    await refreshData();
  } catch {
    renderAuth();
  }
}

init();
