// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFetch } from './useFetch';

function Probe() {
  const { data, error, retry } = useFetch<{ ok: boolean }>('puzzles/index.json');
  if (error) return <button onClick={retry}>retry: {error}</button>;
  if (!data) return <p>loading</p>;
  return <p>data: {String(data.ok)}</p>;
}

afterEach(() => vi.unstubAllGlobals());

describe('useFetch', () => {
  it('resolves BASE_URL-relative JSON', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<Probe />);
    expect(await screen.findByText('data: true')).toBeTruthy();
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${import.meta.env.BASE_URL}puzzles/index.json`,
    );
  });

  it('surfaces errors and retries on demand', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('nope', { status: 404 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<Probe />);
    const button = await screen.findByRole('button');
    expect(button.textContent).toContain('HTTP 404');
    await act(async () => button.click());
    expect(await screen.findByText('data: true')).toBeTruthy();
  });
});
