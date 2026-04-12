export interface User {
  id: string;
  name: string | null;
  currency: string;
  auth_mode: 'local' | 'cloud';
  total_budget: number | null;
  created_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: string;
  brand_colour: string;
  letter_avatar: string;
  balance: number;
  starting_balance: number;
  is_active: boolean;
  is_deletable: boolean;
  sort_order: number;
  created_at: string;
  last_reconciled_at?: string | null;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  amount: number;
  type: 'expense' | 'income';
  category: string | null;
  merchant_name: string | null;
  display_name: string | null;
  transaction_note: string | null;
  signal_source: 'description' | 'merchant' | 'time_history' | 'manual' | null;
  date: string;
  receipt_url: string | null;
  account_deleted: boolean;
  merchant_confidence: number | null;
  amount_confidence: number | null;
  date_confidence: number | null;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  emoji: string | null;
  tile_bg_colour: string | null;
  text_colour: string | null;
  budget_limit: number | null;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
}

export interface BillReminder {
  id: string;
  user_id: string;
  title: string;
  amount: number | null;
  merchant_name: string | null;
  due_date: string;
  is_recurring: boolean;
  is_paid: boolean;
  created_at: string;
}
