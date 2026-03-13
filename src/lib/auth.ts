const encoder = new TextEncoder();

export async function hashPassword(password: string) {
  const data = encoder.encode(password);
  const hash = crypto.subtle.digest('SHA-256', data);

  return hash.then((buffer) => {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  });
}
