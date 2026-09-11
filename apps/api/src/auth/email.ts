import { BadRequestException } from '@nestjs/common';
import { isEmail } from 'class-validator';

export interface NormalizedEmail {
  email: string;
  normalizedEmail: string;
}

export function normalizeEmailAddress(input: string): NormalizedEmail {
  const email = input.trim();
  if (!isEmail(email) || email.length > 254) {
    throw new BadRequestException('Invalid email address.');
  }
  const separator = email.lastIndexOf('@');
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  return {
    email,
    normalizedEmail: `${local.toLowerCase()}@${domain.toLowerCase()}`,
  };
}
