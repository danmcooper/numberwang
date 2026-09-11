// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Person } from '../../../shared/puzzle';
import Card from './Card';

const person = (number: number, colour: string, numberwang = false): Person => ({
  number, colour, numberwang, clue: null, origHint: null, paths: [],
});

const noop = () => {};
// Card's props are all required bar tag/mark/clueNode.
const base = {
  label: 'A1',
  flipped: false,
  rejected: false,
  consumed: false,
  justFlipped: false,
  numberReferenced: false,
  colourReferenced: false,
  numberBounce: false,
  colourBounce: false,
  pickerOpen: false,
  hintClue: false,
  hintCard: false,
  onOpen: noop,
  onCycleTag: noop,
  onOpenPicker: noop,
  onPickMark: noop,
  onToggleClue: noop,
};

const cardEl = () => screen.getByRole('group');

describe('Card', () => {
  it('shows the number as the card face', () => {
    render(<Card {...base} person={person(17, 'teal')} />);
    expect(screen.getByText('17')).toBeTruthy();
  });

  it('carries a colour band in every state, and the band has no text', () => {
    for (const flipped of [false, true]) {
      const { unmount, container } = render(
        <Card {...base} flipped={flipped} person={person(17, 'teal', true)} />,
      );
      const band = container.querySelector('.colour-band');
      expect(band).toBeTruthy();
      expect(band!.textContent).toBe('');
      unmount();
    }
  });

  it('names the colour on the band for assistive tech, since it carries no text', () => {
    const { container } = render(<Card {...base} person={person(17, 'teal')} />);
    expect(container.querySelector('.colour-band')!.getAttribute('aria-label')).toBe('teal');
  });

  it('takes the band colour from a custom property, not an inline hex', () => {
    const { container } = render(<Card {...base} person={person(17, 'teal')} />);
    const band = container.querySelector('.colour-band') as HTMLElement;
    expect(band.style.background).toBe('var(--colour-teal)');
  });

  it('is neither solved class while unflipped', () => {
    render(<Card {...base} person={person(17, 'teal', true)} />);
    expect(cardEl().className).not.toContain('numberwang');
  });

  it('marks a flipped Numberwang card', () => {
    render(<Card {...base} flipped person={person(17, 'teal', true)} />);
    expect(cardEl().classList.contains('numberwang')).toBe(true);
    expect(cardEl().classList.contains('not-numberwang')).toBe(false);
  });

  it('marks a flipped Not Numberwang card', () => {
    render(<Card {...base} flipped person={person(17, 'teal', false)} />);
    expect(cardEl().classList.contains('not-numberwang')).toBe(true);
    expect(cardEl().classList.contains('numberwang')).toBe(false);
  });

  it('says the catchphrase on a fresh correct call', () => {
    render(<Card {...base} flipped justFlipped person={person(17, 'teal', true)} />);
    expect(screen.getByText("That's Numberwang!")).toBeTruthy();
  });

  it('does not say the catchphrase for a Not Numberwang card', () => {
    render(<Card {...base} flipped justFlipped person={person(17, 'teal', false)} />);
    expect(screen.queryByText("That's Numberwang!")).toBeNull();
    expect(screen.getByText('Correct!')).toBeTruthy();
  });

  it('highlights the number and the band independently', () => {
    const { container } = render(
      <Card {...base} numberReferenced colourReferenced person={person(17, 'teal')} />,
    );
    expect(container.querySelector('.card-number')!.className).toContain('referenced');
    expect(container.querySelector('.colour-band')!.className).toContain('referenced');
  });

  it('gives the confetti a per-card offset so solved cards do not look stamped', () => {
    const seed = (n: number) => {
      const { container } = render(<Card {...base} flipped person={person(n, 'red', true)} />);
      return (container.querySelector('.card') as HTMLElement).style.getPropertyValue(
        '--confetti-seed',
      );
    };
    expect(seed(3)).not.toBe(seed(18));
  });
});
