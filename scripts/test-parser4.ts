import { extractItems } from '../src/services/aiCategoryMap';

const newFillers = [
  'very', 'really', 'so', 'too', 'quite', 'just', 'only', 'even', 'also',
  'always', 'never', 'sometimes', 'often', 'usually', 'now', 'then', 'here',
  'there', 'today', 'tomorrow', 'yesterday', 'tonight', 'morning', 'afternoon',
  'evening', 'night', 'month', 'year', 'week', 'day', 'myself', 'yourself',
  'himself', 'herself', 'itself', 'ourselves', 'themselves', 'friends', 'family',
  'nag', 'mga', 'yung', 'ung', 'tong', 'itong', 'niyang', 'kong', 'mong',
  'nating', 'nilang', 'kayong', 'tayong', 'silang', 'namin', 'aming', 'aking',
  'iyong', 'kanyang', 'kanilang', 'nice', 'good', 'bad', 'great', 'awesome',
  'some', 'any', 'all', 'many', 'much', 'few', 'little', 'big', 'small', 'large',
  'went', 'go', 'going', 'took', 'take', 'taking', 'gave', 'give', 'giving',
  'made', 'make', 'making', 'did', 'do', 'doing', 'saw', 'see', 'seeing',
  'purchased', 'purchase', 'purchasing', 'shop', 'shopping', 'shopped'
];

// simulate adding to DISPLAY_STOP_WORDS
// We will write a custom wrapper to test it.

export function extractItemsCustom(
  text: string,
  options: any = {}
): string[] {
  if (!text || !text.trim()) return [];
  // scrubAuxText logic here is simplified for test
  let cleaned = ` ${text.toLowerCase()} `;
  cleaned = cleaned.replace(/₱|\bpesos?\b|\bpiso\b|\bphp\b/gi, ' ');
  cleaned = cleaned.replace(/\d+(?:[.,]\d+)*/g, '|');
  cleaned = cleaned.replace(/\b(?:and|plus|then|ug|tsaka)\b/gi, '|');
  cleaned = cleaned.replace(/[+,]/g, '|');
  
  if (options.accountSurface) {
      cleaned = cleaned.replace(new RegExp(`\\b${options.accountSurface}\\b`, 'gi'), ' ');
  }

  const segments = cleaned.split('|');
  const seen = new Set<string>();
  const out: string[] = [];

  const STOP_WORDS = new Set([
      'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'you', 'your',
      'a', 'an', 'the', 'and', 'or', 'plus', 'with', 'for', 'to', 'at',
      'in', 'on', 'of', 'from', 'into', 'onto', 'than', 'then', 'as',
      'this', 'that', 'these', 'those', 'so', 'just',
      'na', 'ng', 'mga', 'ang', 'ako', 'ko', 'sa', 'kay', 'din', 'rin',
      'lang', 'po', 'opo', 'ay', 'ito', 'iyon', 'siya', 'kami', 'kayo', 'sila',
      'ni', 'nila', 'naming', 'natin', 'niya',
      'nga', 'kug', "ko'g", 'tag', 'usa', 'duha', 'tulo', 'upat', 'lima',
      'gamay', 'dako', 'gamit', 'unya', 'taas', 'naa', 'nia', 'aron',
      'spent', 'spend', 'bought', 'buy', 'paid', 'pay', 'paying',
      'ate', 'eat', 'eats', 'eating', 'got', 'gets', 'getting', 'have',
      'had', 'has', 'order', 'ordered', 'ordering', 'order', 'used',
      'kain', 'kumain', 'kakain', 'mag-kain', 'magkain',
      'kaon', 'mikaon', 'mokaon', 'mukaon', 'nagkaon', 'kumakain',
      'bumili', 'bili', 'mipalit', 'palit', 'mopalit', 'pumalit',
      'binayad', 'bayad', 'magbayad', 'nibayad', 'mibayad',
      'today', 'yesterday', 'tomorrow', 'tonight',
      'kahapon', 'bukas', 'ngayon', 'kanina', 'mamaya', 'gabi', 'umaga',
      'gabii', 'buntag', 'ugma', 'karon',
      ...newFillers
  ]);

  for (const seg of segments) {
    const words = seg
      .split(/\s+/)
      .map((w) => w.replace(/[^\w-]/g, ''))
      .filter((w) => {
        if (w.length === 0) return false;
        const lower = w.toLowerCase();
        if (STOP_WORDS.has(lower)) return false;
        return true;
      });
    if (words.length === 0) continue;
    const phrase = words.join(' ');
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
  }
  return out;
}

const texts = [
  "I bought rottiserrie chicken 900 gcash",
  "bumili ako ng manok sa sm supermarket",
  "nag bayad ng kuryente sa meralco",
  "paid my internet bill in pldt",
  "grab from makati to bgc",
  "ordered foodpanda adobo and rice",
  "dinner at mamou with friends",
  "grocery at puregold",
  "sweldo ko this month",
  "bought a very nice shoes for myself",
  "I bought a GPU",
];

for (const t of texts) {
  console.log(`\nText: "${t}"`);
  console.log(`Items:`, extractItemsCustom(t, { accountSurface: "gcash" })); // using gcash to mock
}
