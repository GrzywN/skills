const CURRENCY = 'zł';

export function parseAmount(value) {
  return Number.parseFloat(String(value).replace(',', '.'));
}

function groupThousands(digits) {
  let grouped = '';
  for (let index = 0; index < digits.length; index += 1) {
    if (index > 0 && (digits.length - index) % 3 === 0) grouped += ' ';
    grouped += digits[index];
  }
  return grouped;
}

export function formatMoney(amount) {
  const sign = amount < 0 ? '-' : '';
  const [whole, fraction] = Math.abs(amount).toFixed(2).split('.');
  const figure = [groupThousands(whole), fraction].filter(Boolean).join(',');
  return `${sign}${figure} ${CURRENCY}`;
}

export function invoiceTotals({ quantity, unitPrice, vatRate }) {
  const net = parseAmount(quantity) * parseAmount(unitPrice);
  const vat = (net * Number(vatRate)) / 100;
  return { net, vat, gross: net + vat };
}
