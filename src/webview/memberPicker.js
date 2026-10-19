const vscode = acquireVsCodeApi();
const library = document.getElementById('library');
const sourceFile = document.getElementById('sourceFile');
const member = document.getElementById('member');
const error = document.getElementById('error');
for (const input of [library, sourceFile, member]) {
  const list = document.getElementById(input.getAttribute('aria-controls'));
  const options = Array.from(list.children);
  let matches = [];
  let active = -1;
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    options.forEach(option => option.setAttribute('aria-selected', 'false'));
    active = -1;
  };
  const filter = () => {
    close();
    const query = input.value.trim().toUpperCase();
    matches = options.filter(option => {
      option.hidden = !option.textContent.toUpperCase().includes(query);
      return !option.hidden;
    });
    list.hidden = matches.length === 0;
    input.setAttribute('aria-expanded', String(!list.hidden));
  };
  const select = option => {
    input.value = option.textContent;
    close();
  };
  input.addEventListener('focus', filter);
  input.addEventListener('input', filter);
  input.addEventListener('blur', close);
  options.forEach(option => option.addEventListener('mousedown', event => {
    event.preventDefault();
    select(option);
  }));
  input.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.hidden) filter();
      if (!matches.length) return;
      active = active < 0
        ? (event.key === 'ArrowDown' ? 0 : matches.length - 1)
        : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      options.forEach(option => option.setAttribute('aria-selected', 'false'));
      const option = matches[active];
      option.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!list.hidden && active >= 0) select(matches[active]);
      else document.getElementById('ok').click();
    } else if (event.key === 'Escape' && !list.hidden) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
}
document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
document.getElementById('ok').addEventListener('click', () => {
  error.textContent = '';
  vscode.postMessage({
    type: 'submit', library: library.value, sourceFile: sourceFile.value,
    member: member.value, mode: document.querySelector('input[name="mode"]:checked').value
  });
});
window.addEventListener('message', event => {
  if (event.data.type === 'error') error.textContent = event.data.message;
});
library.focus();