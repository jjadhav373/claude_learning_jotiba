/**
 * Data access layer. Every SQL statement in the backend lives under this folder.
 * Services receive a `Repos` bundle bound to either the pool or a transaction client.
 */
import type { Queryable } from '../db/pool.js';
import { leadRepository } from './leadRepository.js';
import { sourceRepository } from './sourceRepository.js';
import { consentRepository } from './consentRepository.js';
import { quizRepository } from './quizRepository.js';
import { findingRepository } from './findingRepository.js';
import { handoffRepository } from './handoffRepository.js';
import { documentRepository } from './documentRepository.js';
import { eventRepository, leadCardRepository, otpRepository, referenceRepository, whatsappRepository } from './supportRepositories.js';

export const createRepos = (db: Queryable) => ({
  leads: leadRepository(db),
  sources: sourceRepository(db),
  consents: consentRepository(db),
  quiz: quizRepository(db),
  findings: findingRepository(db),
  handoffs: handoffRepository(db),
  documents: documentRepository(db),
  events: eventRepository(db),
  otps: otpRepository(db),
  reference: referenceRepository(db),
  whatsapp: whatsappRepository(db),
  leadCards: leadCardRepository(db),
});
export type Repos = ReturnType<typeof createRepos>;
