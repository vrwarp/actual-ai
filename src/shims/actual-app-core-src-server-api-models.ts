export interface APIAccountEntity {
  id: string;
  name: string;
  offbudget?: boolean;
  closed?: boolean;
  balance_current?: number | null;
}

export interface APICategoryEntity {
  id: string;
  name: string;
  group_id: string;
  is_income?: boolean;
  hidden?: boolean;
}

export interface APICategoryGroupEntity {
  id: string;
  name: string;
  is_income?: boolean;
  hidden?: boolean;
  categories?: APICategoryEntity[];
}

export interface APIPayeeEntity {
  id: string;
  name: string;
  transfer_acct?: string;
}
