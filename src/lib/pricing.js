export const num = (value = 0) => Number(value || 0);

export const profitPrice = (product = {}) => num(product.profit_price);
export const basePrice = (product = {}) => num(product.price);
export const finalPrice = (product = {}) => basePrice(product) + profitPrice(product);
export const lineTotal = (unitPrice, quantity) => num(unitPrice) * num(quantity);
export const lineProfitTotal = (profit, quantity) => num(profit) * num(quantity);

export function discountAmount(subtotal, discountType, discountValue) {
  const rawDiscount = discountType === '%'
    ? lineTotal(subtotal, num(discountValue) / 100)
    : num(discountValue);

  return Math.max(0, rawDiscount);
}

export function profitBasedDiscount(subtotal, profitSubtotal, discountType, discountValue) {
  return Math.min(discountAmount(subtotal, discountType, discountValue), Math.max(0, num(profitSubtotal)));
}

export function discountedTotals(subtotal, profitSubtotal, discountType, discountValue) {
  const appliedDiscount = profitBasedDiscount(subtotal, profitSubtotal, discountType, discountValue);

  return {
    discountAmount: appliedDiscount,
    total: Math.max(0, num(subtotal) - appliedDiscount),
    profit: Math.max(0, num(profitSubtotal) - appliedDiscount)
  };
}

export function allocateDiscountedProfit(items = [], appliedDiscount = 0) {
  const profitSubtotal = items.reduce((sum, item) => sum + lineProfitTotal(item.profit_price, item.quantity), 0);
  let remainingDiscount = profitBasedDiscount(profitSubtotal, profitSubtotal, '$', appliedDiscount);

  return items.map((item, index) => {
    const lineProfit = lineProfitTotal(item.profit_price, item.quantity);
    const lineDiscount = index === items.length - 1
      ? remainingDiscount
      : profitSubtotal > 0
        ? Math.min(remainingDiscount, appliedDiscount * (lineProfit / profitSubtotal))
        : 0;

    remainingDiscount -= lineDiscount;

    return {
      ...item,
      total_profit: Math.max(0, lineProfit - lineDiscount)
    };
  });
}
