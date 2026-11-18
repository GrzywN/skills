import { formValues, sendJson } from '/static/ui.js';

const form = document.getElementById('signup-form');
const formError = document.getElementById('form-error');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const response = await sendJson('POST', '/api/signup', formValues(form));
  if (response.ok) {
    location.href = '/invoices';
    return;
  }
  formError.textContent = `Error ${response.status}`;
  formError.hidden = false;
  form.reset();
});
