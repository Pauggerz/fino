import { extractItems, buildDisplayName } from '../src/intelligence/categorize/categorize';

const text1 = "I bought rottiserrie chicken 900 gcash";
console.log("No account surface 1:", extractItems(text1));

const text2 = "bought chicken from bpi";
console.log("No account surface 2:", extractItems(text2));
