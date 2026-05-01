export interface MappedTransaction {
  id: string;
  type: 'deposit' | 'sent' | 'received';
  sum: string;
  status: string;
  counterparty: string | null;
  createdAt: string;
}

export interface PaginatedMappedTransactions {
  items: MappedTransaction[];
  total: number;
  page: number;
  limit: number;
}
