import { extractItems } from '../src/intelligence/categorize/categorize';

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
];

for (const t of texts) {
  console.log(`\nText: "${t}"`);
  console.log(`Items:`, extractItems(t));
}
