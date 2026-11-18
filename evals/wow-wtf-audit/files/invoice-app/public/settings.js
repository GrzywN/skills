import { formValues, sendJson } from '/static/ui.js';

const form = document.getElementById('settings-form');
const saved = document.getElementById('saved');

function showAccount(account) {
  document.getElementById('email').textContent = account.email;
  for (const name of ['companyName', 'taxId', 'phone']) form.elements[name].value = account[name];
}

form.addEventListener('input', () => {
  saved.textContent = '';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const result = await sendJson('PUT', '/api/account', formValues(form));
  saved.textContent = result.ok ? 'Saved.' : 'Could not save, try again.';
});

const response = await fetch('/api/account');
if (response.ok) showAccount(await response.json());
else location.href = '/login';
