import { formatMoney, invoiceTotals } from '/static/money.js';
import { build, formValues, sendJson } from '/static/ui.js';

const DUE_IN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const VAT_RATES = [23, 8, 5, 0];
const TEXT_FIELDS = [
  { name: 'customer', label: 'Customer', required: true },
  { name: 'item', label: 'Item description', required: true },
  { name: 'quantity', label: 'Quantity' },
  { name: 'unitPrice', label: 'Unit price' },
];
const SUMMARY_LINES = [['net', 'Net'], ['vat', 'VAT'], ['gross', 'Total']];

const form = document.getElementById('invoice-form');
const sourceId = new URLSearchParams(location.search).get('from');

function labelled(label, control) {
  return [build('label', { for: control.id }, [label]), control];
}

function textField({ name, label, required }) {
  const input = build('input', { id: name, name, type: 'text' });
  input.required = Boolean(required);
  return labelled(label, input);
}

function renderSummary() {
  const totals = invoiceTotals(formValues(form));
  for (const [key] of SUMMARY_LINES) document.getElementById(`summary-${key}`).textContent = formatMoney(totals[key]);
}

async function renderForm() {
  const options = VAT_RATES.map((rate) => build('option', { value: rate }, [`${rate}%`]));
  const vatRate = build('select', { id: 'vatRate', name: 'vatRate' }, options);
  const dueDate = build('input', { id: 'dueDate', name: 'dueDate', type: 'date' });
  dueDate.value = new Date(Date.now() + DUE_IN_DAYS * DAY_MS).toISOString().slice(0, 10);
  const summaryLines = SUMMARY_LINES.flatMap(([key, label]) => [build('dt', {}, [label]), build('dd', { id: `summary-${key}` })]);
  form.replaceChildren(
    ...TEXT_FIELDS.flatMap(textField),
    ...labelled('VAT rate', vatRate),
    ...labelled('Due date', dueDate),
    build('dl', { class: 'summary' }, summaryLines),
    build('button', { class: 'button', type: 'submit' }, ['Submit']),
  );
  if (sourceId) {
    const response = await fetch(`/api/invoices/${sourceId}`);
    const source = response.ok ? (await response.json()).invoice : {};
    for (const name of ['customer', 'item', 'quantity', 'unitPrice', 'vatRate']) {
      if (name in source) document.getElementById(name).value = source[name];
    }
  }
  renderSummary();
}

function showUpgradeModal() {
  if (document.querySelector('.modal-backdrop')) return;
  document.body.append(document.getElementById('upgrade-modal').content.cloneNode(true));
  document.querySelector('.modal-close').addEventListener('click', () => {
    location.href = '/invoices/new';
  });
  document.getElementById('upgrade').addEventListener('click', () => {
    document.getElementById('upgrade-note').textContent = 'Payments are coming soon.';
  });
}

form.addEventListener('input', renderSummary);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const response = await sendJson('POST', '/api/invoices', formValues(form));
    if (response.status === 401) location.href = '/login';
    if (response.status === 402) showUpgradeModal();
    if (response.ok) location.href = '/invoices';
  } catch (error) {
    return;
  }
});

window.addEventListener('pageshow', renderForm);
