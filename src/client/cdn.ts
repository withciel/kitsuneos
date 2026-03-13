function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand('copy');
    return true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return fallbackCopy(text);
  }
}

const toast = document.getElementById('copy-toast');
let toastTimer: number | undefined;

function showToast() {
  if (!toast) {
    return;
  }

  toast.classList.add('opacity-100');
  toast.classList.remove('opacity-0');

  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }

  toastTimer = window.setTimeout(() => {
    toast.classList.remove('opacity-100');
    toast.classList.add('opacity-0');
  }, 1400);
}

document.addEventListener('click', async (event) => {
  const target = event.target as Element | null;
  const copyNode = target?.closest('[data-copy-url]');

  if (!copyNode) {
    return;
  }

  const url = copyNode.getAttribute('data-copy-url');
  if (!url) {
    return;
  }

  const copied = await copyText(url);
  if (copied) {
    showToast();
  }
});
