/* Generated from collection definitions. Do not edit. */

export interface Account {
  id: string;
  name: string;
  industry?: string | null;
}

export interface Contact {
  id: string;
  account_id: string;
  name: string;
  email?: string | null;
}

export interface Opportunity {
  id: string;
  account_id: string;
  name: string;
  amount?: number | null;
  stage: string;
  next_step?: string | null;
}
