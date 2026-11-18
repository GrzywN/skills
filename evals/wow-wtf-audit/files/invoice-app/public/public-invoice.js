import { formatMoney, invoiceTotals, parseAmount } from '/static/money.js';
import { build } from '/static/ui.js';

const token = location.pathname.split('/').pop();
const response = await fetch(`/api/public/${token}`);
const { seller, invoice } = await response.json();
const totals = invoiceTotals(invoice);
const pairs = (rows) => rows.flatMap(([term, value]) => [build('dt', {}, [term]), build('dd', {}, [value])]);

document.title = `Invoice ${invoice.number} from ${seller.companyName}`;
document.getElementById('seller').textContent = seller.companyName;
document.getElementById('seller-tax-id').textContent = `Tax ID ${seller.taxId}`;
document.getElementById('number').textContent = invoice.number;
document.getElementById('item').textContent = invoice.item;
document.getElementById('item-pricing').textContent = `${invoice.quantity} x ${formatMoney(parseAmount(invoice.unitPrice))}`;
document.getElementById('parties').append(...pairs([
  ['Billed to', invoice.customer],
  ['Issued', invoice.issuedDate],
  ['Due', invoice.dueDate],
]));
document.getElementById('totals').append(...pairs([
  ['Net', formatMoney(totals.net)],
  [`VAT ${invoice.vatRate}%`, formatMoney(totals.vat)],
  ['Total due', formatMoney(totals.gross)],
]));
