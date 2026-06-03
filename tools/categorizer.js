/**
 * Keyword → category mapping. Pure function, no side effects.
 */

const CATEGORY_MAP = [
  // Food & Dining
  { keywords: ['lunch', 'dinner', 'breakfast', 'brunch', 'meal', 'eat', 'food', 'restaurant', 'cafe', 'coffee', 'tea', 'snack', 'pizza', 'burger', 'sushi', 'noodles', 'rice', 'bread', 'bakery', 'beverage', 'drink', 'juice', 'water', 'ice cream', 'dessert', 'takeaway', 'takeout', 'delivery', 'dine'], category: 'Food & Dining', emoji: '🍽️' },

  // Groceries
  { keywords: ['grocery', 'groceries', 'supermarket', 'store', 'market', 'vegetable', 'fruit', ' meat', 'milk', 'egg', 'bread', 'oil', 'spice', 'cooking', 'kitchen'], category: 'Groceries', emoji: '🛒' },

  // Transport
  { keywords: ['bus', 'taxi', 'uber', 'cab', 'car', 'fuel', 'gas', 'petrol', 'diesel', 'toll', 'parking', 'metro', 'train', 'flight', 'air', 'bike', 'petrol', 'auto', 'rickshaw', 'fare', 'transport', 'commute', 'ride'], category: 'Transport', emoji: '🚗' },

  // Housing & Rent
  { keywords: ['rent', 'apartment', 'house', 'housing', 'lease', 'mortgage', 'maintenance', 'repair', 'plumber', 'electrician', 'cleaning', 'society', 'flat'], category: 'Housing & Rent', emoji: '🏠' },

  // Utilities
  { keywords: ['electric', 'electricity', 'gas bill', 'water', 'utility', 'phone', 'mobile', 'recharge', 'load', 'data', 'internet', 'wifi', 'broadband', 'cable'], category: 'Utilities', emoji: '💡' },

  // Bills & Fees
  { keywords: ['bill', 'fee', 'fine', 'penalty', 'tax', 'charge', 'service charge', 'late fee', 'registration', 'renewal', 'membership', 'subscription', 'due'], category: 'Bills & Fees', emoji: '🧾' },

  // Entertainment
  { keywords: ['movie', 'film', 'cinema', 'theatre', 'theater', 'concert', 'ticket', 'game', 'gaming', 'play', 'sport', 'netflix', 'spotify', 'music', 'book', 'magazine', 'hobby', 'fun', 'party', 'club'], category: 'Entertainment', emoji: '🎬' },

  // Shopping
  { keywords: ['shop', 'shopping', 'buy', 'purchase', 'cloth', 'clothes', 'shoe', 'shoes', 'dress', 'accessory', 'bag', 'electronics', 'gadget', 'online', 'amazon', 'market', 'mall'], category: 'Shopping', emoji: '🛍️' },

  // Clothing
  { keywords: ['shirt', 'pant', 'jeans', 'trouser', 'jacket', 'coat', 'sweater', 't-shirt', 'shoe', 'sandal', 'sneaker', 'suit', 'tie', 'scarf', 'hat', 'cap', 'uniform'], category: 'Clothing', emoji: '👕' },

  // Health
  { keywords: ['doctor', 'hospital', 'clinic', 'medicine', 'medical', 'pharmacy', 'drug', 'health', 'dentist', 'eye', 'checkup', 'lab', 'test', 'operation', 'surgery', 'therapy', 'gym', 'fitness', 'vitamin', 'supplement'], category: 'Health', emoji: '💊' },

  // Education
  { keywords: ['school', 'college', 'university', 'tuition', 'course', 'class', 'lesson', 'book', 'stationery', 'fee', 'admission', 'exam', 'test', 'training', 'seminar', 'workshop', 'study'], category: 'Education', emoji: '📚' },

  // Travel
  { keywords: ['hotel', 'hostel', 'resort', 'trip', 'tour', 'travel', 'vacation', 'holiday', 'luggage', 'baggage', 'passport', 'visa', 'booking', 'airbnb', 'stay'], category: 'Travel', emoji: '✈️' },

  // Gifts
  { keywords: ['gift', 'present', 'donation', 'charity', 'give', 'birthday', 'wedding', 'anniversary', 'celebration'], category: 'Gifts', emoji: '🎁' },

  // Insurance
  { keywords: ['insurance', 'medical insurance', 'car insurance', 'life insurance', 'health insurance', 'premium'], category: 'Insurance', emoji: '🛡️' },

  // Salary (income)
  { keywords: ['salary', 'wage', 'pay', 'payment', 'income', 'earning', 'pension', 'allowance', 'stipend'], category: 'Salary', emoji: '💰' },

  // Freelance (income)
  { keywords: ['freelance', 'freelancing', 'contract', 'gig', 'client', 'project', 'consulting', 'commission', 'bonus', 'overtime'], category: 'Freelance', emoji: '💻' },

  // Investments (income)
  { keywords: ['investment', 'dividend', 'interest', 'profit', 'return', 'stock', 'share', 'bond', 'mutual fund', 'crypto', 'trading', 'rental income'], category: 'Investments', emoji: '📈' },
];

/**
 * Match a note string against the keyword map.
 * @param {string} note
 * @returns {{ category: string, emoji: string }}
 */
export function categorize(note) {
  if (!note || typeof note !== 'string') return { category: 'Other', emoji: '📌' };

  const lower = note.toLowerCase().trim();

  for (const entry of CATEGORY_MAP) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) return { category: entry.category, emoji: entry.emoji };
    }
  }

  return { category: 'Other', emoji: '📌' };
}

/**
 * Return the full keyword map for debugging.
 */
export function getCategoryList() {
  const seen = new Set();
  return CATEGORY_MAP.map(e => {
    if (seen.has(e.category)) return null;
    seen.add(e.category);
    return { category: e.category, emoji: e.emoji };
  }).filter(Boolean);
}
