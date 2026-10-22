export type OperationType =
  | 'BUY'
  | 'SELL'
  | 'DIVIDEND'
  | 'TAX_WITHHOLDING'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'TRANSFER'
  | 'INTEREST'
  | 'FEE'
  | 'UNKNOWN';

export interface Transaction {
  id: string;
  sourceRow: number;
  operationType: OperationType;
  date: Date;
  currency: string;
  quantity?: number;
  price?: number;
  amount?: number; // net amount in base currency
  description?: string;
  ticker?: string;
  isin?: string;
  metadata?: Record<string, any>;
}

export interface BuyTransaction extends Transaction {
  operationType: 'BUY';
  quantity: number;
  price: number;
}

export interface SellTransaction extends Transaction {
  operationType: 'SELL';
  quantity: number;
  price: number;
}

export interface DividendTransaction extends Transaction {
  operationType: 'DIVIDEND';
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
}

export interface TaxWithholdingTransaction extends Transaction {
  operationType: 'TAX_WITHHOLDING';
  taxAmount: number;
  underlyingTransactionId: string;
}

export interface DepositTransaction extends Transaction {
  operationType: 'DEPOSIT';
  amount: number; // positive = inflow
}

export interface WithdrawalTransaction extends Transaction {
  operationType: 'WITHDRAWAL';
  amount: number; // positive = outflow
}

export interface TransferTransaction extends Transaction {
  operationType: 'TRANSFER';
  fromAccount?: string;
  toAccount?: string;
}

export interface InterestTransaction extends Transaction {
  operationType: 'INTEREST';
  grossAmount: number;
  taxAmount?: number;
  netAmount: number;
}

export interface FeeTransaction extends Transaction {
  operationType: 'FEE';
  amount: number;
  description?: string;
}

export interface UnknownTransaction extends Transaction {
  operationType: 'UNKNOWN';
  rawData: Record<string, any>;
}

export type TransactionRecord =
  | BuyTransaction
  | SellTransaction
  | DividendTransaction
  | TaxWithholdingTransaction
  | DepositTransaction
  | WithdrawalTransaction
  | TransferTransaction
  | InterestTransaction
  | FeeTransaction
  | UnknownTransaction;

