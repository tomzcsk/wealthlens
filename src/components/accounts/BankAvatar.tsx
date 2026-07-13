/**
 * WealthLens — brand avatar for a bank account (F33).
 * Real bank logo (bundled under /public/banks) in a rounded tile; a neutral
 * 🏦 fallback when the account isn't a known Thai bank.
 */
import { useState, type ReactNode } from 'react';

import type { BankAccount } from '@/types';
import { resolveBank } from '@/data/thaiBanks';

interface BankAvatarProps {
  account: Pick<BankAccount, 'name' | 'bankKey'>;
  /** Tile size. */
  size?: 'sm' | 'md';
}

export const BankAvatar = ({
  account,
  size = 'md',
}: BankAvatarProps): ReactNode => {
  const bank = resolveBank(account);
  const [broken, setBroken] = useState(false);
  const box = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';

  if (!bank || broken) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-raised text-ink-400 ${box}`}
        aria-hidden="true"
      >
        🏦
      </span>
    );
  }

  if (bank.emoji) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-lg ${box}`}
        style={{ backgroundColor: `${bank.color}1a` }}
        title={bank.label}
      >
        {bank.emoji}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-card border border-ink-200 overflow-hidden ${box}`}
      title={bank.label}
    >
      <img
        src={bank.logo}
        alt={bank.label}
        loading="lazy"
        onError={() => setBroken(true)}
        className="w-full h-full object-contain p-0.5"
      />
    </span>
  );
};

export default BankAvatar;
