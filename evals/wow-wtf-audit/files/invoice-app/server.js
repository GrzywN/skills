import { createServer } from 'node:http';
import { randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 4173;
const PUBLIC_DIR = fileURLToPath(new URL('./public', import.meta.url));
const SESSION_COOKIE = 'kwit_session';
const LIST_QUERY_MS = 2500;
const INVOICE_WRITE_MS = 800;
const PLAN_INVOICE_LIMIT = 3;
const CUSTOMER_MAX_LENGTH = 200;
const PASSWORD_MIN_LENGTH = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const ASSET_TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const publicFiles = new Set(readdirSync(PUBLIC_DIR));
const users = new Map();
const sessions = new Map();
const routes = [];

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const newToken = (bytes = 16) => randomBytes(bytes).toString('hex');
const isoDate = (daysFromToday = 0) => new Date(Date.now() + daysFromToday * DAY_MS).toISOString().slice(0, 10);
const hashPassword = (password, salt) => scryptSync(password, salt, 32).toString('hex');
const text = (value) => String(value ?? '').trim();

function createUser({ email, password, companyName, taxId, phone }) {
  const salt = newToken(8);
  const user = {
    email,
    salt,
    passwordHash: hashPassword(password, salt),
    companyName,
    taxId,
    phone,
    invoices: [],
    removedInvoices: new Map(),
    invoiceCounter: 0,
  };
  users.set(email, user);
  return user;
}

function addInvoice(user, draft, issuedDate = isoDate()) {
  const customer = text(draft.customer);
  if (customer.length > CUSTOMER_MAX_LENGTH) throw new RangeError('customer does not fit the name column');
  user.invoiceCounter += 1;
  const invoice = {
    id: newToken(6),
    number: `INV-${String(user.invoiceCounter).padStart(4, '0')}`,
    publicToken: newToken(),
    customer,
    item: text(draft.item),
    quantity: text(draft.quantity),
    unitPrice: text(draft.unitPrice),
    vatRate: Number(draft.vatRate),
    issuedDate,
    dueDate: text(draft.dueDate),
  };
  user.invoices.unshift(invoice);
  return invoice;
}

function findPublicInvoice(token) {
  for (const seller of users.values()) {
    const invoice = seller.invoices.find((candidate) => candidate.publicToken === token);
    if (invoice) return { seller, invoice };
  }
  return null;
}

function isAcceptablePassword(password) {
  const hasDigit = [...password].some((character) => character >= '0' && character <= '9');
  return password.length >= PASSWORD_MIN_LENGTH && hasDigit;
}

function sessionToken(request) {
  const cookies = (request.headers.cookie ?? '').split(';').map((part) => part.trim());
  const cookie = cookies.find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return cookie ? cookie.slice(SESSION_COOKIE.length + 1) : '';
}

function startSession(response, user) {
  const token = newToken(24);
  sessions.set(token, user);
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax`);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  return body ? JSON.parse(body) : {};
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(payload === undefined ? '' : JSON.stringify(payload));
}

function sendPage(response, fileName, status = 200) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(readFileSync(join(PUBLIC_DIR, fileName)));
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function route(method, pattern, handler) {
  routes.push({ method, parts: pattern.split('/'), handler });
}

function matchRoute(method, path) {
  const parts = path.split('/');
  for (const candidate of routes) {
    if (candidate.method !== method || candidate.parts.length !== parts.length) continue;
    const params = {};
    const matches = candidate.parts.every((part, index) => {
      if (!part.startsWith(':')) return part === parts[index];
      params[part.slice(1)] = parts[index];
      return true;
    });
    if (matches) return { handler: candidate.handler, params };
  }
  return null;
}

const page = (fileName) => ({ response }) => sendPage(response, fileName);
const privatePage = (fileName) => ({ response, user }) => (user ? sendPage(response, fileName) : redirect(response, '/login'));
const signedIn = (handler) => (context) => (context.user ? handler(context) : sendJson(context.response, 401, { error: 'Not signed in' }));
const accountView = ({ email, companyName, taxId, phone }) => ({ email, companyName, taxId, phone });

route('GET', '/', page('index.html'));
route('GET', '/signup', page('signup.html'));
route('GET', '/login', page('login.html'));
route('GET', '/invoices', privatePage('invoices.html'));
route('GET', '/invoices/new', privatePage('invoice-new.html'));
route('GET', '/settings', privatePage('settings.html'));

route('GET', '/invoices/:id', ({ response, user, params }) => {
  if (!user) return redirect(response, '/login');
  const known = user.invoices.some((invoice) => invoice.id === params.id);
  return known ? sendPage(response, 'invoice.html') : sendPage(response, 'not-found.html', 404);
});

route('GET', '/p/:token', ({ response, params }) => {
  return findPublicInvoice(params.token) ? sendPage(response, 'public-invoice.html') : sendPage(response, 'not-found.html', 404);
});

route('GET', '/static/:file', ({ response, params }) => {
  const contentType = ASSET_TYPES[extname(params.file)];
  if (!contentType || !publicFiles.has(params.file)) return sendPage(response, 'not-found.html', 404);
  response.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
  return response.end(readFileSync(join(PUBLIC_DIR, params.file)));
});

route('POST', '/api/signup', async ({ request, response }) => {
  const body = await readJsonBody(request);
  const account = {
    email: text(body.email).toLowerCase(),
    password: String(body.password ?? ''),
    companyName: text(body.companyName),
    taxId: text(body.taxId),
    phone: text(body.phone),
  };
  const complete = Object.values(account).every((value) => value !== '');
  if (!complete || !isAcceptablePassword(account.password)) return sendJson(response, 422, { error: 'Unprocessable account data' });
  if (users.has(account.email)) return sendJson(response, 409, { error: 'Account already exists' });
  startSession(response, createUser(account));
  return sendJson(response, 201, { ok: true });
});

route('POST', '/api/login', async ({ request, response }) => {
  const body = await readJsonBody(request);
  const user = users.get(text(body.email).toLowerCase());
  const valid = user && hashPassword(String(body.password ?? ''), user.salt) === user.passwordHash;
  if (!valid) return sendJson(response, 401, { error: 'Wrong email or password.' });
  startSession(response, user);
  return sendJson(response, 200, { ok: true });
});

route('POST', '/api/logout', ({ request, response }) => {
  sessions.delete(sessionToken(request));
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
  sendJson(response, 200, { ok: true });
});

route('GET', '/api/invoices', signedIn(async ({ response, user }) => {
  await pause(LIST_QUERY_MS);
  sendJson(response, 200, { invoices: user.invoices });
}));

route('POST', '/api/invoices', signedIn(async ({ request, response, user }) => {
  const draft = await readJsonBody(request);
  await pause(INVOICE_WRITE_MS);
  if (user.invoices.length >= PLAN_INVOICE_LIMIT) return sendJson(response, 402, { error: 'Plan limit reached' });
  return sendJson(response, 201, { invoice: addInvoice(user, draft) });
}));

route('GET', '/api/invoices/:id', signedIn(({ response, user, params }) => {
  const invoice = user.invoices.find((candidate) => candidate.id === params.id);
  return invoice ? sendJson(response, 200, { invoice }) : sendJson(response, 404, { error: 'Invoice not found' });
}));

route('DELETE', '/api/invoices/:id', signedIn(({ response, user, params }) => {
  const position = user.invoices.findIndex((candidate) => candidate.id === params.id);
  if (position === -1) return sendJson(response, 404, { error: 'Invoice not found' });
  const [invoice] = user.invoices.splice(position, 1);
  user.removedInvoices.set(invoice.id, { invoice, position });
  return sendJson(response, 200, { ok: true });
}));

route('POST', '/api/invoices/:id/restore', signedIn(({ response, user, params }) => {
  const removed = user.removedInvoices.get(params.id);
  if (!removed) return sendJson(response, 404, { error: 'Invoice not found' });
  user.removedInvoices.delete(params.id);
  user.invoices.splice(Math.min(removed.position, user.invoices.length), 0, removed.invoice);
  return sendJson(response, 200, { invoice: removed.invoice });
}));

route('GET', '/api/public/:token', ({ response, params }) => {
  const match = findPublicInvoice(params.token);
  if (!match) return sendJson(response, 404, { error: 'Invoice not found' });
  const { companyName, taxId } = match.seller;
  const { id, ...invoice } = match.invoice;
  return sendJson(response, 200, { seller: { companyName, taxId }, invoice });
});

route('GET', '/api/account', signedIn(({ response, user }) => sendJson(response, 200, accountView(user))));

route('PUT', '/api/account', signedIn(async ({ request, response, user }) => {
  const body = await readJsonBody(request);
  user.companyName = text(body.companyName);
  user.taxId = text(body.taxId);
  user.phone = text(body.phone);
  sendJson(response, 200, accountView(user));
}));

function seedDemoAccount() {
  const demo = createUser({
    email: 'demo@kwit.example',
    password: 'demo-password-1',
    companyName: 'Nowak Studio',
    taxId: 'PL5213870274',
    phone: '+48 601 234 567',
  });
  addInvoice(demo, {
    customer: 'Kawiarnia Zielona Filiżanka',
    item: 'Menu photography, half-day session',
    quantity: '2',
    unitPrice: '950',
    vatRate: 23,
    dueDate: isoDate(11),
  }, isoDate(-3));
}

const server = createServer(async (request, response) => {
  const path = request.url.split('?')[0];
  const match = matchRoute(request.method, path);
  try {
    if (!match) return sendPage(response, 'not-found.html', 404);
    return await match.handler({ request, response, params: match.params, user: sessions.get(sessionToken(request)) });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: 'Internal server error' });
  }
});

seedDemoAccount();
server.listen(PORT, () => console.log(`Kwit is listening on port ${PORT}`));
