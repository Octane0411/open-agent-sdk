import { v4 as uuidv4 } from 'uuid';
import type { UUID } from '../types/messages.js';

export function generateUUID(): UUID {
  return uuidv4();
}
