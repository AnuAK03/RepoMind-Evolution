async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const body = await res.json();
      throw new Error(body?.error || `HTTP ${res.status}`);
    }
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  postJson: <T>(url: string, body: unknown) =>
    request<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  postForm: <T>(url: string, formData: FormData) =>
    request<T>(url, {
      method: 'POST',
      body: formData,
    }),
  del: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
};
