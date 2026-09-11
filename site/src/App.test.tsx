// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from './App';

afterEach(() => vi.unstubAllGlobals());

it('renders the archive shell', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
  render(<App />);
  expect(await screen.findByRole('heading', { name: /puzzle archive/i })).toBeTruthy();
});
