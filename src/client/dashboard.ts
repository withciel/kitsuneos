const input = document.getElementById('file') as HTMLInputElement | null;
const details = document.getElementById('selected-file-details');
const fileName = document.getElementById('selected-file-name');
const size = document.getElementById('selected-file-size');
const left = document.getElementById('storage-left-after-upload');

if (input && details && fileName && size && left) {
  const usedBytes = Number(details.getAttribute('data-storage-used-bytes') ?? '0');
  const limitBytes = Number(details.getAttribute('data-storage-limit-bytes') ?? '1');

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes < 0) {
      return '0 B';
    }

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
  };

  input.addEventListener('change', () => {
    const file = input.files?.[0];

    if (!file) {
      details.classList.add('hidden');
      return;
    }

    const projectedLeft = Math.max(limitBytes - (usedBytes + file.size), 0);
    const leftPercent = (projectedLeft / limitBytes) * 100;

    fileName.textContent = file.name;
    size.textContent = formatBytes(file.size);
    left.textContent = `${formatBytes(projectedLeft)} (${leftPercent.toFixed(2)}%)`;
    details.classList.remove('hidden');
  });
}

const form = document.getElementById('upload-form') as HTMLFormElement | null;
const button = document.getElementById('upload-button') as HTMLButtonElement | null;
const errorDiv = document.getElementById('error-message') as HTMLDivElement | null;
const script = document.currentScript as HTMLScriptElement | null;
const basePath = script?.getAttribute('data-base-path') ?? '';

if (form && button && errorDiv) {
  button.addEventListener('click', async (e) => {
    e.preventDefault();

    button.disabled = true;
    button.textContent = 'Uploading...';
    errorDiv.classList.add('hidden');

    try {
      const formData = new FormData(form);
      const response = await fetch(`${basePath}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json() as { success: boolean; error?: string; data?: { url: string } };

      if (data.success) {
        window.location.href = basePath ?? '/';
      } else {
        errorDiv.textContent = data.error ?? 'An error occurred during upload.';
        errorDiv.classList.remove('hidden');
        button.disabled = false;
        button.textContent = 'Upload';
      }
    } catch (err) {
      errorDiv.textContent = 'Network error. Please try again.';
      errorDiv.classList.remove('hidden');
      button.disabled = false;
      button.textContent = 'Upload';
    }
  });
}
