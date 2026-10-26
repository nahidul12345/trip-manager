export function formatMoney(amount: number, currency = 'BDT'): string {
  const symbol = currency === 'BDT' ? '৳' : currency;
  return `${symbol} ${amount.toLocaleString('en-US')}`;
}
