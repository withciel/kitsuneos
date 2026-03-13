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
