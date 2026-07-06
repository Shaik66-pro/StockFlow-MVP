const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    writeDb({
      users: [],
      organizations: [],
      products: [],
      settings: [],
      sessions: []
    });
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function now() {
  return new Date().toISOString();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf("=");
        return [decodeURIComponent(cookie.slice(0, index)), decodeURIComponent(cookie.slice(index + 1))];
      })
  );
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `sf_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "sf_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendError(res, status, message, details = {}) {
  sendJson(res, status, { error: message, ...details });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function publicUser(user, organization, setting) {
  return {
    id: user.id,
    email: user.email,
    organization: {
      id: organization.id,
      name: organization.name,
      defaultLowStockThreshold: setting.defaultLowStockThreshold
    }
  };
}

function getAuthContext(req, db = readDb()) {
  const token = parseCookies(req).sf_session;
  if (!token) return null;
  const session = db.sessions.find((item) => item.token === token && new Date(item.expiresAt).getTime() > Date.now());
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  if (!user) return null;
  const organization = db.organizations.find((item) => item.id === user.organizationId);
  const setting = getSetting(db, organization.id);
  return { db, session, user, organization, setting };
}

function requireAuth(req, res) {
  const context = getAuthContext(req);
  if (!context) {
    sendError(res, 401, "You need to log in first.");
    return null;
  }
  return context;
}

function getSetting(db, organizationId) {
  let setting = db.settings.find((item) => item.organizationId === organizationId);
  if (!setting) {
    setting = { organizationId, defaultLowStockThreshold: 5, updatedAt: now() };
    db.settings.push(setting);
    writeDb(db);
  }
  return setting;
}

function validateProduct(input, db, organizationId, productId = null) {
  const errors = {};
  const name = String(input.name || "").trim();
  const sku = String(input.sku || "").trim();
  const description = String(input.description || "").trim();
  const quantityOnHand = Number(input.quantityOnHand);
  const costPrice = input.costPrice === "" || input.costPrice == null ? null : Number(input.costPrice);
  const sellingPrice = input.sellingPrice === "" || input.sellingPrice == null ? null : Number(input.sellingPrice);
  const lowStockThreshold = input.lowStockThreshold === "" || input.lowStockThreshold == null ? null : Number(input.lowStockThreshold);

  if (!name) errors.name = "Name is required.";
  if (!sku) errors.sku = "SKU is required.";
  if (db.products.some((item) => item.organizationId === organizationId && item.id !== productId && item.sku.toLowerCase() === sku.toLowerCase())) {
    errors.sku = "SKU must be unique for this organization.";
  }
  if (!Number.isInteger(quantityOnHand) || quantityOnHand < 0) errors.quantityOnHand = "Quantity must be a whole number 0 or higher.";
  if (costPrice !== null && (!Number.isFinite(costPrice) || costPrice < 0)) errors.costPrice = "Cost price must be 0 or higher.";
  if (sellingPrice !== null && (!Number.isFinite(sellingPrice) || sellingPrice < 0)) errors.sellingPrice = "Selling price must be 0 or higher.";
  if (lowStockThreshold !== null && (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0)) errors.lowStockThreshold = "Threshold must be a whole number 0 or higher.";

  return {
    errors,
    value: { name, sku, description, quantityOnHand, costPrice, sellingPrice, lowStockThreshold }
  };
}

function scopedProducts(db, organizationId) {
  return db.products
    .filter((item) => item.organizationId === organizationId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function productView(product, defaultLowStockThreshold) {
  const effectiveThreshold = product.lowStockThreshold ?? defaultLowStockThreshold;
  return {
    ...product,
    effectiveLowStockThreshold: effectiveThreshold,
    isLowStock: product.quantityOnHand <= effectiveThreshold
  };
}

function dashboard(db, organizationId, defaultLowStockThreshold) {
  const products = scopedProducts(db, organizationId).map((item) => productView(item, defaultLowStockThreshold));
  return {
    totalProducts: products.length,
    totalQuantity: products.reduce((sum, product) => sum + product.quantityOnHand, 0),
    inventoryValue: products.reduce((sum, product) => sum + product.quantityOnHand * (product.sellingPrice || 0), 0),
    lowStockItems: products.filter((product) => product.isLowStock)
  };
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === "POST" && pathname === "/api/signup") {
      const input = await readBody(req);
      const email = normalizeEmail(input.email);
      const password = String(input.password || "");
      const confirmPassword = String(input.confirmPassword || "");
      const organizationName = String(input.organizationName || "").trim();
      const errors = {};
      const db = readDb();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
      if (password.length < 8) errors.password = "Password must be at least 8 characters.";
      if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match.";
      if (!organizationName) errors.organizationName = "Organization name is required.";
      if (db.users.some((user) => user.email === email)) errors.email = "An account already exists for this email.";
      if (Object.keys(errors).length) return sendError(res, 422, "Please fix the highlighted fields.", { errors });

      const organization = { id: id("org"), name: organizationName, createdAt: now(), updatedAt: now() };
      const user = { id: id("usr"), organizationId: organization.id, email, passwordHash: hashPassword(password), createdAt: now(), updatedAt: now() };
      const setting = { organizationId: organization.id, defaultLowStockThreshold: 5, updatedAt: now() };
      const session = { token: id("ses"), userId: user.id, createdAt: now(), expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() };

      db.organizations.push(organization);
      db.users.push(user);
      db.settings.push(setting);
      db.sessions.push(session);
      writeDb(db);
      setSessionCookie(res, session.token);
      return sendJson(res, 201, { user: publicUser(user, organization, setting) });
    }

    if (req.method === "POST" && pathname === "/api/login") {
      const input = await readBody(req);
      const email = normalizeEmail(input.email);
      const password = String(input.password || "");
      const db = readDb();
      const user = db.users.find((item) => item.email === email);
      if (!user || !verifyPassword(password, user.passwordHash)) return sendError(res, 401, "Invalid email or password.");
      const organization = db.organizations.find((item) => item.id === user.organizationId);
      const setting = getSetting(db, organization.id);
      const session = { token: id("ses"), userId: user.id, createdAt: now(), expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() };
      db.sessions = db.sessions.filter((item) => new Date(item.expiresAt).getTime() > Date.now());
      db.sessions.push(session);
      writeDb(db);
      setSessionCookie(res, session.token);
      return sendJson(res, 200, { user: publicUser(user, organization, setting) });
    }

    if (req.method === "POST" && pathname === "/api/logout") {
      const db = readDb();
      const token = parseCookies(req).sf_session;
      db.sessions = db.sessions.filter((item) => item.token !== token);
      writeDb(db);
      clearSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && pathname === "/api/me") {
      const context = requireAuth(req, res);
      if (!context) return;
      return sendJson(res, 200, { user: publicUser(context.user, context.organization, context.setting) });
    }

    if (req.method === "GET" && pathname === "/api/dashboard") {
      const context = requireAuth(req, res);
      if (!context) return;
      return sendJson(res, 200, dashboard(context.db, context.organization.id, context.setting.defaultLowStockThreshold));
    }

    if (req.method === "GET" && pathname === "/api/products") {
      const context = requireAuth(req, res);
      if (!context) return;
      const products = scopedProducts(context.db, context.organization.id).map((product) => productView(product, context.setting.defaultLowStockThreshold));
      return sendJson(res, 200, { products });
    }

    if (req.method === "POST" && pathname === "/api/products") {
      const context = requireAuth(req, res);
      if (!context) return;
      const input = await readBody(req);
      const { errors, value } = validateProduct(input, context.db, context.organization.id);
      if (Object.keys(errors).length) return sendError(res, 422, "Please fix the highlighted fields.", { errors });
      const product = {
        id: id("prd"),
        organizationId: context.organization.id,
        ...value,
        createdAt: now(),
        updatedAt: now(),
        lastUpdatedBy: context.user.id
      };
      context.db.products.push(product);
      writeDb(context.db);
      return sendJson(res, 201, { product: productView(product, context.setting.defaultLowStockThreshold) });
    }

    const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
    if (productMatch && req.method === "PUT") {
      const context = requireAuth(req, res);
      if (!context) return;
      const product = context.db.products.find((item) => item.id === productMatch[1] && item.organizationId === context.organization.id);
      if (!product) return sendError(res, 404, "Product not found.");
      const input = await readBody(req);
      const { errors, value } = validateProduct(input, context.db, context.organization.id, product.id);
      if (Object.keys(errors).length) return sendError(res, 422, "Please fix the highlighted fields.", { errors });
      Object.assign(product, value, { updatedAt: now(), lastUpdatedBy: context.user.id });
      writeDb(context.db);
      return sendJson(res, 200, { product: productView(product, context.setting.defaultLowStockThreshold) });
    }

    if (productMatch && req.method === "DELETE") {
      const context = requireAuth(req, res);
      if (!context) return;
      const before = context.db.products.length;
      context.db.products = context.db.products.filter((item) => !(item.id === productMatch[1] && item.organizationId === context.organization.id));
      if (context.db.products.length === before) return sendError(res, 404, "Product not found.");
      writeDb(context.db);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "PUT" && pathname === "/api/settings") {
      const context = requireAuth(req, res);
      if (!context) return;
      const input = await readBody(req);
      const threshold = Number(input.defaultLowStockThreshold);
      if (!Number.isInteger(threshold) || threshold < 0) {
        return sendError(res, 422, "Please fix the highlighted fields.", { errors: { defaultLowStockThreshold: "Threshold must be a whole number 0 or higher." } });
      }
      context.setting.defaultLowStockThreshold = threshold;
      context.setting.updatedAt = now();
      writeDb(context.db);
      return sendJson(res, 200, { setting: context.setting });
    }

    return sendError(res, 404, "Route not found.");
  } catch (error) {
    const status = error.message === "Invalid JSON" ? 400 : 500;
    return sendError(res, status, status === 400 ? error.message : "Something went wrong.");
  }
}

function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
        res.end(fallback);
      });
      return;
    }
    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

ensureDb();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url.pathname);
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`StockFlow MVP running at http://localhost:${PORT}`);
});
