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

  it('shows the colour group as the number\'s ink and nothing else', () => {
    for (const flipped of [false, true]) {
      const { unmount, container } = render(
        <Card {...base} flipped={flipped} person={person(17, 'teal', true)} />,
      );
      expect(container.querySelector('.colour-band')).toBeNull();
      // The group is never spelled out either: no card says "teal".
      expect(container.textContent).not.toContain('teal');
      unmount();
    }
  });

  it('is neither solved class while unflipped', () => {
    render(<Card {...base} person={person(17, 'teal', true)} />);
    expect(cardEl().className).not.toContain('numberwang');
  });

  it('marks a flipped Numberwang card', () => {
    render(<Card {...base} flipped person={person(17, 'teal', true)} />);
    expect(cardEl().classList.contains('numberwang')).toBe(true);
    expect(cardEl().classList.contains('wangernumb')).toBe(false);
  });

  it('marks a flipped Wangernumb card', () => {
    render(<Card {...base} flipped person={person(17, 'teal', false)} />);
    expect(cardEl().classList.contains('wangernumb')).toBe(true);
    expect(cardEl().classList.contains('numberwang')).toBe(false);
  });

  it('says the catchphrase on a fresh correct call', () => {
    render(<Card {...base} flipped justFlipped person={person(17, 'teal', true)} />);
    expect(screen.getByText("That's Numberwang!")).toBeTruthy();
  });

  it('does not say the catchphrase for a Wangernumb card', () => {
    render(<Card {...base} flipped justFlipped person={person(17, 'teal', false)} />);
    expect(screen.queryByText("That's Numberwang!")).toBeNull();
    expect(screen.getByText('Correct!')).toBeTruthy();
  });

  it('leans a fact card over, and leaves a real clue upright', () => {
    const fact = { ...person(17, 'teal'), origHint: null };
    const clue = { ...person(17, 'teal'), origHint: 'numberwang_count(2)' };
    const { container, unmount } = render(
      <Card {...base} flipped person={fact} clueNode={<span>Octopuses have three hearts.</span>} />,
    );
    expect(container.querySelector('.card-clue')!.classList.contains('flavour')).toBe(true);
    unmount();
    const second = render(
      <Card {...base} flipped person={clue} clueNode={<span>17 is Numberwang</span>} />,
    );
    expect(second.container.querySelector('.card-clue')!.classList.contains('flavour')).toBe(false);
  });

  it('takes the unsolved number colour from the same custom property as the band', () => {
    const { container } = render(<Card {...base} person={person(17, 'teal')} />);
    expect((cardEl() as HTMLElement).style.getPropertyValue('--card-colour')).toBe(
      'var(--colour-teal)',
    );
    expect(container.querySelector('.card-number')).toBeTruthy();
  });

  it('highlights a number reference and a colour reference independently', () => {
    const { container, unmount } = render(
      <Card {...base} numberReferenced person={person(17, 'teal')} />,
    );
    expect(container.querySelector('.card-number')!.className).toContain('referenced');
    expect(cardEl().className).not.toContain('colour-ref');
    unmount();
    // The colour has no element of its own now, so its reference rings the card.
    render(<Card {...base} colourReferenced person={person(17, 'teal')} />);
    expect(cardEl().className).toContain('colour-ref');
    expect(document.querySelector('.card-number')!.className).not.toContain('referenced');
  });

  it('throws confetti with the catchphrase, and only then', () => {
    const burst = (p: Person, justFlipped = true) => {
      const { container, unmount } = render(
        <Card {...base} flipped justFlipped={justFlipped} person={p} />,
      );
      const found = container.querySelectorAll('.confetti-piece').length;
      unmount();
      return found;
    };
    const numberwang = person(17, 'teal', true);
    expect(burst(numberwang)).toBeGreaterThan(0);
    // Not on a Wangernumb call, and not on a card that was already solved when
    // the board was drawn: the burst is the moment, not the state.
    expect(burst(person(17, 'teal', false))).toBe(0);
    expect(burst(numberwang, false)).toBe(0);
  });

  it('aims each piece of confetti somewhere different', () => {
    const { container } = render(
      <Card {...base} flipped justFlipped person={person(17, 'teal', true)} />,
    );
    const bearings = [...container.querySelectorAll('.confetti-piece')].map((el) =>
      (el as HTMLElement).style.getPropertyValue('--i'),
    );
    expect(new Set(bearings).size).toBe(bearings.length);
  });

  it('keeps the confetti clear of the card, which clips its own overflow', () => {
    const { container } = render(
      <Card {...base} flipped justFlipped person={person(17, 'teal', true)} />,
    );
    expect(container.querySelector('.card .confetti-burst')).toBeNull();
    expect(container.querySelector('.card-container > .confetti-burst')).toBeTruthy();
  });
});
