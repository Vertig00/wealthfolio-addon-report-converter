import { describe, it, expect } from 'vitest';
import { parseMBankReport } from './parser';

function makeFile(content: string, name = 'mbank.csv'): File {
  const bytes = new TextEncoder().encode(content);
  return new File([bytes], name, { type: 'text/csv' });
}

const TX_REPORT = `mBank S.A. Bankowosc Detaliczna
Skrytka Pocztowa 2108
90-959 Lodz 2
www.mBank.pl
mLinia: 801 300 800
+48 (42) 6 300 800

eMAKLER - Historia transakcji

#Imie i nazwisko
Jan Kowalski

#Nr rachunku mBM
12345678

#Nr rachunku powiazanego
#

#Data
11.11.2026


Kryteria wyszukiwania
#Data od
01.01.2023
#Data do
01.01.2024
#Wybrana kategoria
Brak
#Wybrany typ instrumentu
Brak
#Wybrany papier
Brak

Czas transakcji;Papier;Gielda;K/S;Liczba;Kurs;Waluta;Prowizja;Waluta;Wartosc;Waluta
12.12.2023 09:33:21;PKNORLEN;WWA-GPW;K;5;64,03;PLN;5,00;PLN;320,15;PLN
13.11.2023 17:28:13;RBOT LN ETF;GBR-LSE;S;10;11,08;USD;14,00;PLN;458,58;PLN
`;

const FIN_REPORT = `mBank S.A. Bankowosc Detaliczna
Skrytka Pocztowa 2108
90-959 Lodz 2
www.mBank.pl
mLinia: 801 300 800
+48 (42) 6 300 800

eMAKLER - Historia finansowa

#Imie i nazwisko
Jan Kowalski

#Nr rachunku mBM
12345678

#Nr rachunku powiazanego
#

#Data
11.11.2026


Kryteria wyszukiwania
#Data od
01.01.2023
#Data do
01.01.2024

Data;Opis;Kwota
30.09.2022 15:17:52;Dywidenda: DP: 2022-09-21 IE00B6YX5C33 (SPY5 LN ETF);;13,29
07.10.2024 10:32:30;IKZE 2024;1 000,00
31.05.2022 10:08:26;Blokada srodkow pod zlecenie kupna nr 84632787;-483,69
14.12.2023 11:32:57;WYC: 97570512 NOT: 104045157 ZLC: 92562511 PW: PLTLKPL00017;9,08
31.12.2021 15:37:40;NA CEL INWESTYCYJNY Z OSZCZEDNOSCI;5 660,17
`;

describe('parseMBankReport', () => {
  it('parses a transaction report', async () => {
    const file = makeFile(TX_REPORT);
    const result = await parseMBankReport(file, 'emakler');
    expect(result.error).toBeUndefined();
    expect(result.kind).toBe('transactions');
    expect(result.transactions).toHaveLength(2);

    const buy = result.transactions[0];
    expect(buy.operationType).toBe('BUY');
    expect(buy.quantity).toBe(5);
    expect(buy.price).toBe(64.03);
    expect(buy.currency).toBe('PLN');
    expect((buy.metadata as any).fee).toBe(5);
    expect((buy.metadata as any).resolvedSymbol).toBe('PKN.WA');

    const sell = result.transactions[1];
    expect(sell.operationType).toBe('SELL');
    expect(sell.currency).toBe('USD');
    expect(sell.fxRate).toBeCloseTo(458.58 / (10 * 11.08), 5);
  });

  it('parses a financial report and skips settlement/reservation rows', async () => {
    const file = makeFile(FIN_REPORT);
    const result = await parseMBankReport(file, 'emakler');
    expect(result.error).toBeUndefined();
    expect(result.kind).toBe('financial');
    // dividend + IKZE deposit + savings deposit; WYC and Blokada skipped
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0].operationType).toBe('DIVIDEND');
    expect(result.transactions[1].operationType).toBe('DEPOSIT');
    expect(result.transactions[2].operationType).toBe('DEPOSIT');
    expect(result.warnings).toHaveLength(0);
  });

  it('returns an error for an unknown header', async () => {
    const file = makeFile('foo;bar\n1;2\n');
    const result = await parseMBankReport(file, 'emakler');
    expect(result.error).toBeDefined();
    expect(result.transactions).toHaveLength(0);
  });

  it('rejects unsupported subtypes', async () => {
    const file = makeFile(TX_REPORT);
    const result = await parseMBankReport(file, 'other' as any);
    expect(result.error).toContain('Unsupported');
  });
});
