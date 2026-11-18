import { formatMoney, invoiceTotals, parseAmount } from '/static/money.js';
import { build } from '/static/ui.js';

const COPIED_MS = 2000;
const invoiceId = location.pathname.split('/').pop();
const copyButton = document.getElementById('copy-link');

function showInvoice(invoice) {
  const totals = invoiceTotals(invoice);
  const details = [
    ['Client', invoice.customer],
    ['Item', invoice.item],
    ['Quantity', invoice.quantity],
    ['Unit price', formatMoney(parseAmount(invoice.unitPrice))],
    ['Net', formatMoney(totals.net)],
    [`VAT ${invoice.vatRate}%`, formatMoney(totals.vat)],
    ['Total', formatMoney(totals.gross)],
    ['Issued', invoice.issuedDate],
    ['Due', invoice.dueDate],
  ];
  document.title = `${invoice.number} - Kwit`;
  document.getElementById('invoice-number').textContent = invoice.number;
  document.getElementById('invoice-details').append(...details.flatMap(([term, value]) => [build('dt', {}, [term]), build('dd', {}, [value])]));
  document.getElementById('duplicate').href = `/invoices/new?from=${invoice.id}`;
  copyButton.addEventListener('click', async () => {
    await navigator.clipboard.writeText(`${location.origin}/p/${invoice.publicToken}`);
    copyButton.textContent = 'Copied';
    setTimeout(() => { copyButton.textContent = 'Copy client link'; }, COPIED_MS);
  });
}

const response = await fetch(`/api/invoices/${invoiceId}`);
if (response.ok) showInvoice((await response.json()).invoice);
else location.href = '/login';
