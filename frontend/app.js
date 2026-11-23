const $ = (selector, root = document) => root.querySelector(selector);
const labels = { new: 'Новая', in_progress: 'В работе', closed: 'Закрыта' };
const filterLabels = { all: 'Все заявки', new: 'Новые', in_progress: 'В работе', closed: 'Закрытые' };
const state = {
  tickets: [], selectedId: null, filter: 'all', search: '', connected: false,
  loaded: false, busy: false, mobileDetail: false, drafts: new Map(),
};
let loadVersion = 0;
let toastTimer;

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const initial = (value) => escape(String(value || '?').trim().slice(0, 1).toUpperCase());
const badge = (status) => `<span class="status status-${escape(status)}">${escape(labels[status] || status)}</span>`;

function rememberedName() {
  try { return localStorage.getItem('bureau-author') || ''; } catch { return ''; }
}

function rememberName(name) {
  try { localStorage.setItem('bureau-author', name); } catch { /* Storage may be disabled. */ }
}

function messageFor(detail, status) {
  if (detail === 'API_UNAVAILABLE' || status === 502) return 'Не удалось подключиться к API. Проверь, что FastAPI запущен.';
  if (Array.isArray(detail)) {
    const fields = { title: 'тему', description: 'описание', author: 'имя автора', name: 'имя оператора', text: 'текст комментария' };
    const name = detail[0]?.loc?.at(-1);
    return `Проверь ${fields[name] || 'данные формы'}. Поле должно быть заполнено корректно.`;
  }
  const messages = {
    'Ticket not found': 'Заявка не найдена. Возможно, её уже удалили.',
    "Ticket status must be 'new'": 'Оператора можно менять только у новой заявки.',
    "Ticket status must be 'new' with assigned operator": 'Для запуска нужна новая заявка с назначенным оператором.',
    "Ticket status must be 'in_progress'": 'Закрыть можно только заявку, которая находится в работе.',
    "Ticket status must be 'new' or 'in_progress'": 'К закрытой заявке нельзя добавить комментарий.',
    'Ticket comments cannot be empty': 'Добавь комментарий с результатом работы, затем закрой заявку.',
    "Cannot delete ticket with status 'in_progress' or 'new'": 'Удалить можно только новую заявку.',
    "Cannot delete ticket with status 'in_progress' or 'closed'": 'Удалить можно только новую заявку.',
  };
  return messages[detail] || (typeof detail === 'string' ? detail : 'Не удалось выполнить действие. Попробуй ещё раз.');
}

async function api(path, method = 'GET', body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    const error = new Error('Нет соединения с сервером. Обнови страницу или попробуй ещё раз.');
    error.offline = true;
    throw error;
  }
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const error = new Error(messageFor(data?.detail, response.status));
    error.offline = response.status === 502;
    throw error;
  }
  return data;
}

function notify(message, error = false) {
  clearTimeout(toastTimer);
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast${error ? ' error' : ''}`;
  toast.setAttribute('role', error ? 'alert' : 'status');
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, error ? 7000 : 3500);
}

function visibleTickets() {
  const query = state.search.trim().toLocaleLowerCase('ru');
  return state.tickets.filter((ticket) => {
    const statusMatch = state.filter === 'all' || ticket.status === state.filter;
    const searchMatch = !query || [ticket.id, ticket.title, ticket.description, ticket.author, ticket.operator]
      .some((value) => String(value ?? '').toLocaleLowerCase('ru').includes(query));
    return statusMatch && searchMatch;
  }).sort((first, second) => second.id - first.id);
}

function selectedTicket() {
  return state.tickets.find((ticket) => ticket.id === state.selectedId);
}

function draftFor(ticket) {
  if (!state.drafts.has(ticket.id)) {
    state.drafts.set(ticket.id, { operator: ticket.operator || '', author: ticket.operator || rememberedName(), text: '' });
  }
  return state.drafts.get(ticket.id);
}

function render() {
  const visible = visibleTickets();
  if (!visible.some((ticket) => ticket.id === state.selectedId)) state.selectedId = visible[0]?.id ?? null;
  $('#connection-warning').hidden = !state.loaded || state.connected;
  $('#open-summary').textContent = state.loaded && state.connected
    ? `Открытых ${state.tickets.filter((ticket) => ticket.status !== 'closed').length}` : 'Служба поддержки';
  $('#new-ticket').disabled = !state.connected || state.busy;
  $('#list-count').textContent = visible.length;
  $('#filter-title').textContent = filterLabels[state.filter];
  for (const button of document.querySelectorAll('[data-filter]')) {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
    $('[data-count]', button).textContent = button.dataset.filter === 'all'
      ? state.tickets.length : state.tickets.filter((ticket) => ticket.status === button.dataset.filter).length;
  }
  $('#ticket-list').setAttribute('aria-busy', String(!state.loaded));
  if (!state.loaded) {
    $('#ticket-list').innerHTML = '<div class="empty"><p>Загружаем заявки…</p></div>';
  } else if (visible.length) {
    $('#ticket-list').innerHTML = visible.map((ticket) => `
      <button class="ticket-row${ticket.id === state.selectedId ? ' selected' : ''}" data-ticket-id="${ticket.id}" aria-pressed="${ticket.id === state.selectedId}">
        <span class="row-top"><span class="ticket-number">Заявка #${ticket.id}</span>${badge(ticket.status)}</span>
        <span class="row-title">${escape(ticket.title)}</span>
        <span class="row-description">${escape(ticket.description)}</span>
        <span class="row-bottom"><span class="avatar small">${initial(ticket.author)}</span><span>${escape(ticket.author)}</span><span class="comment-count"><i class="bubble-icon" aria-hidden="true"></i>${ticket.comments.length}</span></span>
      </button>`).join('');
  } else {
    const searching = state.search.trim() || state.filter !== 'all';
    $('#ticket-list').innerHTML = `<div class="empty"><h3>${state.connected ? searching ? 'Ничего не найдено' : 'Заявок пока нет' : 'Ожидаем соединения'}</h3><p>${state.connected ? searching ? 'Измени запрос или выбери другой статус.' : 'Создай обращение, чтобы начать работу.' : 'Проверь соединение с сервером.'}</p>${state.connected && !searching ? '<button class="button button-secondary" data-action="new">Создать заявку</button>' : ''}</div>`;
  }
  $('#desk').classList.toggle('mobile-detail', state.mobileDetail && state.selectedId !== null);
  renderDetail();
}

function renderDetail() {
  const ticket = selectedTicket();
  const pane = $('#detail');
  pane.setAttribute('aria-busy', String(state.busy));
  pane.classList.toggle('detail-empty', !ticket);
  if (!ticket) {
    pane.innerHTML = '<div class="empty"><h2>Выберите заявку</h2><p>Здесь будут описание, оператор и история обсуждения.</p></div>';
    return;
  }
  const draft = draftFor(ticket);
  const disabled = state.busy || !state.connected;
  const canStart = !!ticket.operator;
  const canClose = ticket.comments.length > 0;
  pane.innerHTML = `<div class="detail-content">
    <button class="mobile-back" data-action="back">К списку заявок</button>
    <div class="detail-top"><span class="ticket-number">Заявка #${ticket.id}</span>${badge(ticket.status)}${ticket.status === 'new' ? `<button class="delete-link" data-action="delete" ${disabled ? 'disabled' : ''}>Удалить</button>` : ''}</div>
    <h2>${escape(ticket.title)}</h2>
    <p class="description">${escape(ticket.description)}</p>
    <div class="author-line"><span class="avatar">${initial(ticket.author)}</span><span>Автор <strong>${escape(ticket.author)}</strong></span></div>
    <section class="section" aria-label="Оператор"><h3 class="section-label">Оператор</h3>
    ${ticket.status === 'new' ? `
      <form class="operator-form" id="operator-form"><input name="operator" aria-label="Имя оператора" placeholder="Назначить оператора" required value="${escape(draft.operator)}" ${disabled ? 'disabled' : ''}><button type="submit" class="button button-secondary" ${disabled ? 'disabled' : ''}>${ticket.operator ? 'Сохранить' : 'Назначить'}</button></form>` : `
      <div class="assigned-operator"><span class="avatar">${initial(ticket.operator)}</span><span>${escape(ticket.operator || 'Не назначен')}</span></div>`}
    ${ticket.status === 'new' ? `<div class="workflow"><button class="button button-primary" data-action="start" ${disabled || !canStart ? 'disabled' : ''}>Взять в работу</button>${!canStart ? '<p class="workflow-note">Сначала назначьте оператора</p>' : ''}</div>` : ''}
    ${ticket.status === 'in_progress' ? `<div class="workflow"><button class="button button-primary" data-action="close" ${disabled || !canClose ? 'disabled' : ''}>Закрыть заявку</button>${!canClose ? '<p class="workflow-note">Добавьте комментарий с результатом работы</p>' : ''}</div>` : ''}
    </section>
    <section class="comments-section" aria-label="Комментарии"><div class="comments-heading"><h3>Обсуждение</h3><span>${ticket.comments.length}</span></div>
      ${ticket.comments.length ? ticket.comments.map((comment) => `<div class="comment"><span class="avatar">${initial(comment.author)}</span><div class="comment-body"><strong>${escape(comment.author)}</strong><p>${escape(comment.text)}</p></div></div>`).join('') : '<p class="comments-empty">Комментариев пока нет. Здесь можно уточнить детали и описать решение.</p>'}
      ${ticket.status !== 'closed' ? `<form class="comment-form" id="comment-form"><label>Автор комментария<input name="author" placeholder="Твоё имя" required value="${escape(draft.author)}" ${disabled ? 'disabled' : ''}></label><label>Комментарий<textarea name="text" rows="3" placeholder="Детали проблемы или результат работы…" required ${disabled ? 'disabled' : ''}>${escape(draft.text)}</textarea></label><div class="comment-form-footer"><button class="button button-secondary" type="submit" ${disabled ? 'disabled' : ''}>Отправить комментарий</button></div></form>` : '<div class="closed-note">Заявка закрыта. История обсуждения сохранена.</div>'}
    </section>
  </div>`;
}

async function loadTickets() {
  const version = ++loadVersion;
  try {
    const tickets = await api('/tickets');
    if (version !== loadVersion) return false;
    state.tickets = tickets;
    state.connected = true;
    state.loaded = true;
    render();
    return true;
  } catch (error) {
    if (version !== loadVersion) return false;
    state.connected = false;
    state.loaded = true;
    render();
    return false;
  }
}

async function mutate(path, method, body, success, onSuccess) {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    const result = await api(path, method, body);
    onSuccess?.(result);
    const refreshed = await loadTickets();
    notify(refreshed ? success : `${success} Для загрузки списка восстановите соединение.`);
    return true;
  } catch (error) {
    if (error.offline) state.connected = false;
    notify(error.message, true);
    return false;
  } finally {
    state.busy = false;
    render();
  }
}

function openCreate() {
  if (state.busy || !state.connected) return;
  const form = $('#create-form');
  form.reset();
  form.elements.author.value = rememberedName();
  $('#create-error').hidden = true;
  $('#create-dialog').showModal();
}

document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    state.mobileDetail = false;
    render();
  });
});
$('#search').addEventListener('input', (event) => { state.search = event.target.value; render(); });
$('#retry').addEventListener('click', () => loadTickets());
$('#new-ticket').addEventListener('click', openCreate);
$('#close-dialog').addEventListener('click', () => { if (!state.busy) $('#create-dialog').close(); });
$('#cancel-create').addEventListener('click', () => { if (!state.busy) $('#create-dialog').close(); });
$('#cancel-delete').addEventListener('click', () => { if (!state.busy) $('#delete-dialog').close(); });
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('cancel', (event) => { if (state.busy) event.preventDefault(); });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog || state.busy) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
}

$('#ticket-list').addEventListener('click', (event) => {
  const row = event.target.closest('[data-ticket-id]');
  if (row) {
    state.selectedId = Number(row.dataset.ticketId);
    state.mobileDetail = true;
    render();
  }
  if (event.target.closest('[data-action="new"]')) openCreate();
});

$('#detail').addEventListener('input', (event) => {
  const ticket = selectedTicket();
  if (!ticket) return;
  const draft = draftFor(ticket);
  if (event.target.closest('#operator-form')) draft.operator = event.target.value;
  if (event.target.closest('#comment-form')) draft[event.target.name] = event.target.value;
});

$('#detail').addEventListener('submit', async (event) => {
  event.preventDefault();
  const ticket = selectedTicket();
  if (!ticket || state.busy) return;
  const form = event.target;
  const values = Object.fromEntries(new FormData(form));
  const draft = draftFor(ticket);
  if (form.id === 'operator-form') {
    if (!values.operator.trim()) { notify('Введите имя оператора.', true); return; }
    await mutate(`/tickets/${ticket.id}/assignee`, 'PATCH', { name: values.operator }, 'Оператор назначен', (result) => {
      draft.operator = result.operator;
      if (!draft.author) draft.author = result.operator;
    });
  }
  if (form.id === 'comment-form') {
    if (!values.author.trim() || !values.text.trim()) { notify('Заполните имя и текст комментария.', true); return; }
    await mutate(`/tickets/${ticket.id}/comments`, 'POST', { author: values.author, text: values.text }, 'Комментарий добавлен', () => {
      draft.text = '';
      rememberName(values.author.trim());
    });
  }
});

$('#detail').addEventListener('click', async (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'back') { state.mobileDetail = false; render(); return; }
  const ticket = selectedTicket();
  if (!ticket || state.busy) return;
  if (action === 'start' || action === 'close') {
    await mutate(`/tickets/${ticket.id}/status`, 'PATCH', { status: action === 'start' ? 'in_progress' : 'closed' }, action === 'start' ? 'Заявка взята в работу' : 'Заявка закрыта');
  }
  if (action === 'delete') {
    $('#delete-dialog').dataset.ticketId = ticket.id;
    $('#delete-description').textContent = `Заявка #${ticket.id} «${ticket.title}» и её комментарии будут удалены.`;
    $('#delete-error').hidden = true;
    $('#delete-dialog').showModal();
  }
});

$('#create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.busy) return;
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  for (const [name, value] of Object.entries(data)) {
    if (!value.trim()) {
      $('#create-error').textContent = 'Заполните все поля. Одних пробелов недостаточно.';
      $('#create-error').hidden = false;
      form.elements[name].focus();
      return;
    }
  }
  state.busy = true;
  $('#create-submit').disabled = true;
  $('#create-submit').textContent = 'Создаём…';
  $('#create-error').hidden = true;
  render();
  try {
    const ticket = await api('/tickets', 'POST', data);
    rememberName(data.author.trim());
    state.filter = 'all';
    state.search = '';
    $('#search').value = '';
    state.selectedId = ticket.id;
    state.mobileDetail = true;
    $('#create-dialog').close();
    const refreshed = await loadTickets();
    notify(refreshed ? 'Заявка создана' : 'Заявка создана. Обновите список после подключения API.');
  } catch (error) {
    if (error.offline) state.connected = false;
    $('#create-error').textContent = error.message;
    $('#create-error').hidden = false;
  } finally {
    state.busy = false;
    $('#create-submit').disabled = false;
    $('#create-submit').textContent = 'Создать заявку';
    render();
  }
});

$('#delete-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.busy) return;
  const dialog = $('#delete-dialog');
  const id = Number(dialog.dataset.ticketId);
  $('#delete-submit').disabled = true;
  const success = await mutate(`/tickets/${id}`, 'DELETE', undefined, 'Заявка удалена', () => {
    state.drafts.delete(id);
    dialog.close();
  });
  $('#delete-submit').disabled = false;
  if (!success) {
    $('#delete-error').textContent = 'Не удалось удалить заявку. Обновите список и попробуйте ещё раз.';
    $('#delete-error').hidden = false;
  }
});

render();
loadTickets();
