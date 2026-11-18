const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOURS_SHORTHAND = /^\s*(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?\b.*@\s*\$?\s*(\d+(?:\.\d+)?)\s*$/i;
const TOAST_DURATION_MS = 8000;

const moneyFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatMoney(amount) {
  return moneyFormat.format(amount);
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function formatQuantity(value) {
  return String(Math.round(value * 100) / 100);
}

function statusLabel(status) {
  return status === 'sent' ? 'Sent' : 'Draft';
}

function element(tag, properties = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, properties);
  for (const child of children) node.append(child);
  return node;
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function api(method, url, body) {
  try {
    const response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

function showMessage(node, kind, content) {
  node.textContent = content;
  node.className = `message ${kind}`;
  node.hidden = false;
}

async function loadAccount() {
  const logout = document.getElementById('logout');
  if (logout) {
    logout.addEventListener('click', async () => {
      await api('POST', '/api/logout');
      window.location.href = '/';
    });
  }
  const result = await api('GET', '/api/me');
  if (!result.ok) return null;
  const user = result.data.user;
  const name = document.getElementById('account-name');
  if (name) name.textContent = user.name;
  return user;
}

async function loadOnboardedAccount() {
  const user = await loadAccount();
  if (user && !user.onboarded) {
    window.location.href = '/onboarding.html';
  }
  return user;
}

function initSignup() {
  const form = document.getElementById('signup-form');
  const message = document.getElementById('form-message');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = await api('POST', '/api/signup', formValues(form));
    if (result.ok) {
      window.location.href = '/onboarding.html';
      return;
    }
    form.reset();
    showMessage(message, 'error', result.data.error || 'Invalid input.');
  });
}

function initLogin() {
  const form = document.getElementById('login-form');
  const message = document.getElementById('form-message');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = await api('POST', '/api/login', formValues(form));
    if (result.ok) {
      window.location.href = result.data.user.onboarded ? '/invoices.html' : '/onboarding.html';
      return;
    }
    form.elements.password.value = '';
    showMessage(message, 'error', result.data.error || 'Could not log in. Try again.');
  });
}

async function initOnboarding() {
  const steps = Array.from(document.querySelectorAll('.onboarding-step'));
  const message = document.getElementById('form-message');
  const answers = {};
  steps.forEach((step, index) => {
    step.addEventListener('submit', async (event) => {
      event.preventDefault();
      Object.assign(answers, formValues(step));
      const next = steps[index + 1];
      if (next) {
        step.hidden = true;
        next.hidden = false;
        next.querySelector('input, select').focus();
        return;
      }
      const result = await api('POST', '/api/onboarding', answers);
      if (result.ok) {
        window.location.href = '/invoices.html';
        return;
      }
      showMessage(message, 'error', result.data.error || 'Could not save your details. Try again.');
    });
  });
  const user = await loadAccount();
  if (user && user.onboarded) {
    window.location.href = '/invoices.html';
  }
}

function showToast(content, actionLabel, onAction) {
  const region = document.getElementById('toast-region');
  region.replaceChildren();
  const action = element('button', { type: 'button', className: 'toast-action', textContent: actionLabel });
  const toast = element('div', { className: 'toast' }, [element('span', { textContent: `${content} ` }), action]);
  const timer = setTimeout(() => toast.remove(), TOAST_DURATION_MS);
  action.addEventListener('click', async () => {
    clearTimeout(timer);
    toast.remove();
    await onAction();
  });
  region.append(toast);
}

async function initInvoices() {
  const rows = document.getElementById('invoice-rows');

  async function refresh() {
    const result = await api('GET', '/api/invoices');
    const invoices = result.ok ? result.data.invoices : [];
    rows.replaceChildren(...invoices.map(renderRow));
  }

  async function removeInvoice(invoice) {
    const result = await api('DELETE', `/api/invoices/${invoice.id}`);
    if (!result.ok) return;
    await refresh();
    showToast('Invoice deleted.', 'Undo', async () => {
      await api('POST', `/api/invoices/${invoice.id}/restore`);
      await refresh();
    });
  }

  function renderRow(invoice) {
    const link = element('a', { href: `/invoice.html?id=${invoice.id}`, textContent: invoice.number });
    const remove = element('button', { type: 'button', className: 'link-button danger-text', textContent: 'Delete' });
    remove.addEventListener('click', () => removeInvoice(invoice));
    return element('tr', {}, [
      element('td', {}, [link]),
      element('td', { textContent: invoice.clientName }),
      element('td', { textContent: formatDate(invoice.createdAt) }),
      element('td', {}, [
        element('span', { className: `status status-${invoice.status}`, textContent: statusLabel(invoice.status) })
      ]),
      element('td', { className: 'numeric', textContent: formatMoney(invoice.total) }),
      element('td', { className: 'numeric' }, [remove])
    ]);
  }

  loadOnboardedAccount();
  await refresh();
}

async function initInvoiceNew() {
  const form = document.getElementById('invoice-form');
  const lines = document.getElementById('line-items');
  const total = document.getElementById('invoice-total');
  const repeatSlot = document.getElementById('repeat-slot');

  function lineAmount(line) {
    const quantity = Number(line.querySelector('.line-quantity').value) || 0;
    const rate = Number(line.querySelector('.line-rate').value) || 0;
    return quantity * rate;
  }

  function updateTotals() {
    let sum = 0;
    for (const line of lines.children) {
      const amount = lineAmount(line);
      line.querySelector('.line-amount').textContent = formatMoney(amount);
      sum += amount;
    }
    total.textContent = formatMoney(sum);
  }

  function addLine(item = {}) {
    const description = element('input', {
      type: 'text',
      className: 'line-description',
      placeholder: 'Description, e.g. 3h design @ 80',
      required: true,
      value: item.description || ''
    });
    const quantity = element('input', {
      type: 'number',
      className: 'line-quantity',
      placeholder: 'Qty',
      min: '0',
      step: 'any',
      required: true,
      value: item.quantity ?? ''
    });
    const rate = element('input', {
      type: 'number',
      className: 'line-rate',
      placeholder: 'Rate',
      min: '0',
      step: 'any',
      required: true,
      value: item.rate ?? ''
    });
    const amount = element('span', { className: 'line-amount', textContent: formatMoney(0) });
    const remove = element('button', { type: 'button', className: 'link-button line-remove', textContent: 'Remove' });
    const line = element('div', { className: 'line-item' }, [description, quantity, rate, amount, remove]);

    description.addEventListener('blur', () => {
      const match = description.value.match(HOURS_SHORTHAND);
      if (!match) return;
      quantity.value = match[1];
      rate.value = match[2];
      updateTotals();
    });
    quantity.addEventListener('input', updateTotals);
    rate.addEventListener('input', updateTotals);
    remove.addEventListener('click', () => {
      line.remove();
      if (lines.children.length === 0) addLine();
      updateTotals();
    });

    lines.append(line);
    updateTotals();
    return line;
  }

  function collect() {
    return {
      clientName: form.elements.clientName.value,
      clientEmail: form.elements.clientEmail.value,
      items: Array.from(lines.children).map((line) => ({
        description: line.querySelector('.line-description').value,
        quantity: Number(line.querySelector('.line-quantity').value),
        rate: Number(line.querySelector('.line-rate').value)
      }))
    };
  }

  function fillFrom(invoice) {
    form.elements.clientName.value = invoice.clientName;
    form.elements.clientEmail.value = invoice.clientEmail || '';
    lines.replaceChildren();
    for (const item of invoice.items) addLine(item);
    updateTotals();
  }

  async function offerRepeat() {
    const result = await api('GET', '/api/invoices');
    if (!result.ok || result.data.invoices.length === 0) return;
    const last = result.data.invoices[0];
    const button = element('button', {
      type: 'button',
      className: 'button',
      textContent: `Start from your last invoice to ${last.clientName}`
    });
    button.addEventListener('click', () => fillFrom(last));
    repeatSlot.replaceChildren(button);
    repeatSlot.hidden = false;
  }

  document.getElementById('add-line-item').addEventListener('click', () => {
    addLine().querySelector('.line-description').focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = await api('POST', '/api/invoices', collect());
    if (result.ok) {
      window.location.href = '/invoices.html';
    }
  });

  addLine();

  const user = await loadOnboardedAccount();
  if (user && user.labs.repeatLastInvoice) {
    await offerRepeat();
  }
}

async function initInvoice() {
  const id = new URLSearchParams(window.location.search).get('id');
  const view = document.getElementById('invoice-view');
  const missing = document.getElementById('invoice-missing');
  const banner = document.getElementById('banner');
  const overlay = document.getElementById('pro-overlay');
  const upgrade = document.getElementById('pro-upgrade');
  const cardForm = document.getElementById('card-form');

  function render(invoice, user) {
    document.title = `${invoice.number} - Billbird`;
    document.getElementById('invoice-number').textContent = invoice.number;
    const status = document.getElementById('invoice-status');
    status.textContent = statusLabel(invoice.status);
    status.className = `status status-${invoice.status}`;
    const business = user.business;
    const fromLines = [
      user.company || user.name,
      business.street,
      [business.postalCode, business.city].filter(Boolean).join(' '),
      business.country,
      business.taxId ? `Tax ID ${business.taxId}` : ''
    ].filter(Boolean);
    const from = document.getElementById('invoice-from');
    from.replaceChildren();
    fromLines.forEach((line, index) => {
      if (index > 0) from.append(element('br'));
      from.append(line);
    });
    const client = document.getElementById('invoice-client');
    client.replaceChildren(invoice.clientName);
    if (invoice.clientEmail) {
      client.append(element('br'), invoice.clientEmail);
    }
    document.getElementById('invoice-issued').textContent = formatDate(invoice.createdAt);
    document.getElementById('invoice-due').textContent = formatDate(invoice.dueAt);
    document.getElementById('invoice-items').replaceChildren(
      ...invoice.items.map((item) =>
        element('tr', {}, [
          element('td', { textContent: item.description }),
          element('td', { className: 'numeric', textContent: formatQuantity(item.quantity) }),
          element('td', { className: 'numeric', textContent: formatMoney(item.rate) }),
          element('td', { className: 'numeric', textContent: formatMoney(item.quantity * item.rate) })
        ])
      )
    );
    document.getElementById('invoice-total').textContent = formatMoney(invoice.total);
    view.hidden = false;
  }

  document.getElementById('send-invoice').addEventListener('click', async () => {
    const result = await api('POST', `/api/invoices/${id}/send`);
    if (result.ok) {
      const status = document.getElementById('invoice-status');
      status.textContent = statusLabel(result.data.invoice.status);
      status.className = `status status-${result.data.invoice.status}`;
      showMessage(banner, 'success', `Sent to ${result.data.invoice.clientEmail}`);
      return;
    }
    showMessage(banner, 'error', `Something went wrong (${result.data.error || 'E_NETWORK'})`);
  });

  document.getElementById('download-pdf').addEventListener('click', () => {
    upgrade.hidden = false;
    cardForm.hidden = true;
    overlay.hidden = false;
  });
  document.getElementById('pro-close').addEventListener('click', () => {
    overlay.hidden = true;
  });
  upgrade.addEventListener('click', () => {
    upgrade.hidden = true;
    cardForm.hidden = false;
  });
  cardForm.addEventListener('submit', (event) => event.preventDefault());

  const user = await loadOnboardedAccount();
  const result = id ? await api('GET', `/api/invoices/${id}`) : { ok: false };
  if (!user || !result.ok) {
    missing.hidden = false;
    return;
  }
  render(result.data.invoice, user);
}

async function initSettings() {
  const form = document.getElementById('settings-form');
  const message = document.getElementById('form-message');
  const repeatToggle = document.getElementById('repeat-last-invoice');
  const labsStatus = document.getElementById('labs-status');
  const deleteInfo = document.getElementById('delete-account-info');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = formValues(form);
    const result = await api('PUT', '/api/settings', {
      name: values.name,
      company: values.company,
      business: {
        street: values.street,
        city: values.city,
        postalCode: values.postalCode,
        country: values.country,
        taxId: values.taxId,
        paymentTerms: Number(values.paymentTerms)
      }
    });
    if (result.ok) {
      document.getElementById('account-name').textContent = result.data.user.name;
      showMessage(message, 'success', 'Settings saved.');
      return;
    }
    showMessage(message, 'error', result.data.error || 'Could not save settings. Try again.');
  });

  repeatToggle.addEventListener('change', async () => {
    const result = await api('PUT', '/api/settings', { labs: { repeatLastInvoice: repeatToggle.checked } });
    if (!result.ok) return;
    labsStatus.hidden = false;
    setTimeout(() => {
      labsStatus.hidden = true;
    }, 2000);
  });

  document.getElementById('delete-account').addEventListener('click', () => {
    deleteInfo.hidden = false;
  });

  const user = await loadOnboardedAccount();
  if (!user) return;
  form.elements.name.value = user.name;
  form.elements.email.value = user.email;
  form.elements.company.value = user.company;
  form.elements.street.value = user.business.street;
  form.elements.city.value = user.business.city;
  form.elements.postalCode.value = user.business.postalCode;
  form.elements.country.value = user.business.country;
  form.elements.taxId.value = user.business.taxId;
  form.elements.paymentTerms.value = String(user.business.paymentTerms);
  repeatToggle.checked = user.labs.repeatLastInvoice;
}

const pages = {
  signup: initSignup,
  login: initLogin,
  onboarding: initOnboarding,
  invoices: initInvoices,
  'invoice-new': initInvoiceNew,
  invoice: initInvoice,
  settings: initSettings
};

window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});

const init = pages[document.body.dataset.page];
if (init) init();
