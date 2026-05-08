import { extractItems, buildDisplayName } from '../src/services/aiCategoryMap';

const text1 = "I bought rottiserrie chicken 900 gcash";
console.log("Text 1:", text1);
console.log("Items 1:", extractItems(text1, { accountSurface: "gcash" }));
console.log("Display Name 1:", buildDisplayName(text1, "food", { accountSurface: "gcash" }));

const text2 = "I bought rottiserrie chicken , rice for 900 and 10 pesos cash";
console.log("Text 2:", text2);
console.log("Items 2:", extractItems(text2, { accountSurface: "cash" }));
console.log("Display Name 2:", buildDisplayName(text2, "food", { accountSurface: "cash" }));
