import { formValues, sendJson } from '/static/ui.js';

const form = document.getElementById('login-form');
const formError = document.getElementById('form-error');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const response = await sendJson('POST', '/api/login', formValues(form));
  if (response.ok) {
    location.href = '/invoices';
    return;
  }
  formError.textContent = 'Wrong email or password.';
  formError.hidden = false;
  form.elements.password.value = '';
  form.elements.password.focus();
});
