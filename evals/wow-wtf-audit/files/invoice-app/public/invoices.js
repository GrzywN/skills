import { formatMoney, invoiceTotals } from '/static/money.js';
import { build } from '/static/ui.js';

const TOAST_MS = 6000;
const COLUMNS = ['Number', 'Contractor', 'Issued', 'Due', 'Total', ''];
const TRASH_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path></svg>';

const content = document.getElementById('content');
const toast = document.getElementById('toast');
let invoices = [];
let lastRemoved = null;
let toastTimer = 0;

function deleteButton(invoice) {
  const button = build('button', { class: 'icon-action', type: 'button', 'aria-label': `Delete invoice ${invoice.number}` });
  button.innerHTML = TRASH_ICON;
  button.addEventListener('click', () => removeInvoice(invoice));
  return button;
}

function invoiceRow(invoice) {
  const numberLink = build('a', { href: `/invoices/${invoice.id}` }, [invoice.number]);
  const cells = [numberLink, invoice.customer, invoice.issuedDate, invoice.dueDate, formatMoney(invoiceTotals(invoice).gross), deleteButton(invoice)];
  return build('tr', {}, cells.map((cell) => build('td', {}, [cell])));
}

function renderTable() {
  const headings = COLUMNS.map((title) => build('th', { scope: 'col' }, [title]));
  const head = build('thead', {}, [build('tr', {}, headings)]);
  const body = build('tbody', {}, invoices.map(invoiceRow));
  content.replaceChildren(build('table', { class: 'invoice-table' }, [head, body]));
}

async function removeInvoice(invoice) {
  const position = invoices.indexOf(invoice);
  const response = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
  if (!response.ok) return;
  invoices.splice(position, 1);
  renderTable();
  lastRemoved = { invoice, position };
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, TOAST_MS);
}

document.getElementById('undo').addEventListener('click', async () => {
  const { invoice, position } = lastRemoved;
  clearTimeout(toastTimer);
  toast.hidden = true;
  const response = await fetch(`/api/invoices/${invoice.id}/restore`, { method: 'POST' });
  if (!response.ok) return;
  invoices.splice(position, 0, invoice);
  renderTable();
});

document.getElementById('new-invoice').addEventListener('click', () => {
  location.href = '/invoices/new';
});

document.getElementById('logout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.href = '/';
});

const response = await fetch('/api/invoices');
if (response.ok) {
  invoices = (await response.json()).invoices;
  renderTable();
} else {
  location.href = '/login';
}
