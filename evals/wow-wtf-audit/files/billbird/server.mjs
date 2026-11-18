import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT) || 4173;
const PUBLIC_DIR = path.join(import.meta.dirname, 'public');
const SESSION_COOKIE = 'billbird_session';
const SESSION_TTL_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LEDGER_COMMIT_MS = 4000;
const MAX_BODY_BYTES = 100 * 1024;
const PAYMENT_TERMS = [0, 7, 14, 30];

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png'
};

const users = new Map();
const sessions = new Map();

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

function passwordMatches(user, password) {
  const expected = Buffer.from(user.passwordHash, 'hex');
  const actual = Buffer.from(hashPassword(password, user.salt), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function createUser({ name, email, password, company }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: crypto.randomUUID(),
    name,
    email: email.toLowerCase(),
    company,
    salt,
    passwordHash: hashPassword(password, salt),
    onboarded: false,
    business: { street: '', city: '', postalCode: '', country: '', taxId: '', paymentTerms: 14 },
    labs: { repeatLastInvoice: false },
    clients: [],
    invoices: [],
    invoiceCounter: 0
  };
  users.set(user.id, user);
  return user;
}

function findUserByEmail(email) {
  const wanted = email.toLowerCase();
  for (const user of users.values()) {
    if (user.email === wanted) return user;
  }
  return null;
}

function resolveClient(user, name, email) {
  const existing = user.clients.find((client) => client.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (email) existing.email = email;
    return existing;
  }
  const client = { id: crypto.randomUUID(), name, email: email || null };
  user.clients.push(client);
  return client;
}

function addInvoice(user, client, items, createdAt = Date.now()) {
  user.invoiceCounter += 1;
  const invoice = {
    id: crypto.randomUUID(),
    number: `INV-${String(user.invoiceCounter).padStart(4, '0')}`,
    clientId: client.id,
    items,
    total: roundMoney(items.reduce((sum, item) => sum + item.quantity * item.rate, 0)),
    status: 'draft',
    createdAt,
    dueAt: createdAt + user.business.paymentTerms * DAY_MS,
    sentAt: null,
    deletedAt: null
  };
  user.invoices.push(invoice);
  return invoice;
}

function presentUser(user) {
  return {
    name: user.name,
    email: user.email,
    company: user.company,
    onboarded: user.onboarded,
    business: user.business,
    labs: user.labs
  };
}

function presentInvoice(user, invoice) {
  const client = user.clients.find((entry) => entry.id === invoice.clientId);
  return {
    id: invoice.id,
    number: invoice.number,
    clientName: client.name,
    clientEmail: client.email,
    items: invoice.items,
    total: invoice.total,
    status: invoice.status,
    createdAt: invoice.createdAt,
    dueAt: invoice.dueAt,
    sentAt: invoice.sentAt
  };
}

function parseItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return null;
  const items = [];
  for (const raw of rawItems) {
    const description = text(raw && raw.description);
    const quantity = Number(raw && raw.quantity);
    const rate = Number(raw && raw.rate);
    if (!description || !Number.isFinite(quantity) || !Number.isFinite(rate) || quantity < 0 || rate < 0) {
      return null;
    }
    items.push({ description, quantity, rate });
  }
  return items;
}

function deliverInvoice(invoice, client) {
  if (!client.email) {
    const error = new Error('Delivery failed');
    error.code = 'E_SEND_17';
    throw error;
  }
  invoice.status = 'sent';
  invoice.sentAt = Date.now();
}

function seed() {
  const user = createUser({
    name: 'Dana Demo',
    email: 'demo@billbird.test',
    password: 'demo-pass-1',
    company: 'Dana Demo Design'
  });
  user.onboarded = true;
  user.business = {
    street: '12 Kestrel Lane',
    city: 'Portland',
    postalCode: '97205',
    country: 'United States',
    taxId: 'US-48-2210934',
    paymentTerms: 14
  };
  const northwind = resolveClient(user, 'Northwind Studio', 'accounts@northwind.test');
  const harbor = resolveClient(user, 'Harbor & Finch', null);
  const now = Date.now();
  const first = addInvoice(
    user,
    northwind,
    [
      { description: 'Brand workshop', quantity: 6, rate: 95 },
      { description: 'Logo concepts', quantity: 12, rate: 95 }
    ],
    now - 20 * DAY_MS
  );
  first.status = 'sent';
  first.sentAt = now - 19 * DAY_MS;
  addInvoice(
    user,
    harbor,
    [
      { description: 'Website copy review', quantity: 4, rate: 80 },
      { description: 'Homepage wireframes', quantity: 7.5, rate: 80 }
    ],
    now - 9 * DAY_MS
  );
  addInvoice(
    user,
    northwind,
    [
      { description: 'Landing page design', quantity: 10, rate: 95 },
      { description: 'Design QA', quantity: 2, rate: 95 }
    ],
    now - 2 * DAY_MS
  );
}

function readCookies(req) {
  const cookies = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function startSession(res, user) {
  const id = crypto.randomBytes(24).toString('hex');
  sessions.set(id, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${id}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
  );
}

function endSession(req, res) {
  const id = readCookies(req)[SESSION_COOKIE];
  if (id) sessions.delete(id);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function currentUser(req) {
  const id = readCookies(req)[SESSION_COOKIE];
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  return users.get(session.userId) || null;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(Object.assign(new Error('Malformed JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function findInvoice(user, id, { includeDeleted = false } = {}) {
  const invoice = user.invoices.find((entry) => entry.id === id);
  if (!invoice) return null;
  if (invoice.deletedAt && !includeDeleted) return null;
  return invoice;
}

async function handleSignup(req, res) {
  const body = await readBody(req);
  const name = text(body.name);
  const email = text(body.email);
  const company = text(body.company);
  const password = typeof body.password === 'string' ? body.password : '';
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validPassword = password.length >= 10 && /\d/.test(password);
  if (!name || !validEmail || !validPassword) {
    sendJson(res, 400, { error: 'Invalid input.' });
    return;
  }
  if (findUserByEmail(email)) {
    sendJson(res, 409, { error: 'An account with this email already exists.' });
    return;
  }
  const user = createUser({ name, email, password, company });
  startSession(res, user);
  sendJson(res, 201, { user: presentUser(user) });
}

async function handleLogin(req, res) {
  const body = await readBody(req);
  const email = text(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const user = email ? findUserByEmail(email) : null;
  if (!user || !passwordMatches(user, password)) {
    sendJson(res, 401, { error: 'Incorrect email or password.' });
    return;
  }
  startSession(res, user);
  sendJson(res, 200, { user: presentUser(user) });
}

async function handleOnboarding(req, res, user) {
  const body = await readBody(req);
  const business = {
    street: text(body.street),
    city: text(body.city),
    postalCode: text(body.postalCode),
    country: text(body.country),
    taxId: text(body.taxId),
    paymentTerms: Number(body.paymentTerms)
  };
  const complete =
    business.street &&
    business.city &&
    business.postalCode &&
    business.country &&
    business.taxId &&
    body.paymentTerms !== '' &&
    PAYMENT_TERMS.includes(business.paymentTerms);
  if (!complete) {
    sendJson(res, 400, { error: 'All fields are required.' });
    return;
  }
  user.business = business;
  user.onboarded = true;
  sendJson(res, 200, { user: presentUser(user) });
}

async function handleSettings(req, res, user) {
  const body = await readBody(req);
  if (typeof body.name === 'string') {
    const name = text(body.name);
    if (!name) {
      sendJson(res, 400, { error: 'Name is required.' });
      return;
    }
    user.name = name;
  }
  if (typeof body.company === 'string') user.company = text(body.company);
  if (body.business && typeof body.business === 'object') {
    for (const key of ['street', 'city', 'postalCode', 'country', 'taxId']) {
      if (typeof body.business[key] === 'string') user.business[key] = text(body.business[key]);
    }
    const terms = Number(body.business.paymentTerms);
    if (body.business.paymentTerms !== undefined && PAYMENT_TERMS.includes(terms)) {
      user.business.paymentTerms = terms;
    }
  }
  if (body.labs && typeof body.labs === 'object' && typeof body.labs.repeatLastInvoice === 'boolean') {
    user.labs.repeatLastInvoice = body.labs.repeatLastInvoice;
  }
  sendJson(res, 200, { user: presentUser(user) });
}

async function handleCreateInvoice(req, res, user) {
  const body = await readBody(req);
  const clientName = text(body.clientName);
  const clientEmail = text(body.clientEmail);
  const items = parseItems(body.items);
  if (!clientName || !items) {
    sendJson(res, 400, { error: 'A client name and at least one line item are required.' });
    return;
  }
  if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
    sendJson(res, 400, { error: 'Client email is not valid.' });
    return;
  }
  await wait(LEDGER_COMMIT_MS);
  const client = resolveClient(user, clientName, clientEmail);
  const invoice = addInvoice(user, client, items);
  sendJson(res, 201, { invoice: presentInvoice(user, invoice) });
}

async function handleApi(req, res, url) {
  const { pathname } = url;
  const method = req.method;

  if (method === 'POST' && pathname === '/api/signup') return handleSignup(req, res);
  if (method === 'POST' && pathname === '/api/login') return handleLogin(req, res);
  if (method === 'POST' && pathname === '/api/logout') {
    endSession(req, res);
    return sendJson(res, 200, { ok: true });
  }

  const user = currentUser(req);
  if (!user) return sendJson(res, 401, { error: 'Not signed in.' });

  if (method === 'GET' && pathname === '/api/me') {
    return sendJson(res, 200, { user: presentUser(user) });
  }
  if (method === 'POST' && pathname === '/api/onboarding') return handleOnboarding(req, res, user);
  if (method === 'PUT' && pathname === '/api/settings') return handleSettings(req, res, user);

  if (method === 'GET' && pathname === '/api/invoices') {
    const invoices = user.invoices
      .filter((invoice) => !invoice.deletedAt)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((invoice) => presentInvoice(user, invoice));
    return sendJson(res, 200, { invoices });
  }
  if (method === 'POST' && pathname === '/api/invoices') return handleCreateInvoice(req, res, user);

  const match = pathname.match(/^\/api\/invoices\/([0-9a-f-]+)(?:\/(send|restore))?$/);
  if (match) {
    const [, id, action] = match;
    if (method === 'POST' && action === 'restore') {
      const invoice = findInvoice(user, id, { includeDeleted: true });
      if (!invoice) return sendJson(res, 404, { error: 'Invoice not found.' });
      invoice.deletedAt = null;
      return sendJson(res, 200, { invoice: presentInvoice(user, invoice) });
    }
    const invoice = findInvoice(user, id);
    if (!invoice) return sendJson(res, 404, { error: 'Invoice not found.' });
    if (method === 'GET' && !action) {
      return sendJson(res, 200, { invoice: presentInvoice(user, invoice) });
    }
    if (method === 'DELETE' && !action) {
      invoice.deletedAt = Date.now();
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'POST' && action === 'send') {
      const client = user.clients.find((entry) => entry.id === invoice.clientId);
      deliverInvoice(invoice, client);
      return sendJson(res, 200, { invoice: presentInvoice(user, invoice) });
    }
  }

  return sendJson(res, 404, { error: 'Not found.' });
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    pathname = '/';
  }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(pathname));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Content-Length': content.length,
      'Cache-Control': 'no-cache'
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (!url.pathname.startsWith('/api/')) {
    serveStatic(req, res, url);
    return;
  }
  try {
    await handleApi(req, res, url);
  } catch (error) {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (error.status) {
      sendJson(res, error.status, { error: error.message });
      return;
    }
    sendJson(res, 500, { error: error.code || 'E_INTERNAL' });
  }
});

seed();

server.listen(PORT, () => {
  console.log(`Billbird is running at http://localhost:${PORT}`);
});
