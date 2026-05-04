export const num = (value = 0) => Number(value || 0);

export const profitPrice = (product = {}) => num(product.profit_price);
export const basePrice = (product = {}) => num(product.price);
export const finalPrice = (product = {}) => basePrice(product) + profitPrice(product);
export const lineTotal = (unitPrice, quantity) => num(unitPrice) * num(quantity);
export const lineProfitTotal = (profit, quantity) => num(profit) * num(quantity);
