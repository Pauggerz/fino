/**
 * Hierarchical category taxonomy — source of truth for offline keyword
 * categorization. Each master expense category (Food, Transport, Shopping,
 * Bills, Health) is a tree of sub-categories. Leaf nodes hold specific
 * keywords; master nodes hold umbrella keywords that don't fit any sub.
 *
 * The bubble-up resolver in `aiCategoryMap.ts` walks the matched node's path
 * from leaf → master and returns the first node whose `name` matches one of
 * the user's active categories (case-insensitive). That lets a single
 * keyword like "starbucks" resolve to "Coffee" if the user has that custom
 * category, "Food" if they only have the default, or fall through to
 * "Others" if they've deleted both.
 *
 * Adding a sub-category? Just push a new child onto the relevant master with
 * a `name` that matches what users would call it (the bubble-up matches by
 * name, so naming consistency matters more than `key`).
 */

export type MasterCategory =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'health'
  | 'other';

export interface TaxonomyNode {
  /** Stable internal key (lowercase, snake_case). */
  key: string;
  /** User-facing display name — bubble-up matches against user category names
   *  via this field, case-insensitively. */
  name: string;
  /** Master expense category this node sits under. Used for display-name
   *  formatting (Transport gets a different formatter than Food/Shopping/etc). */
  master: MasterCategory;
  /** Surface forms that should match this node. Single or multi-word. All
   *  lowercase. */
  keywords: string[];
  /** Optional sub-nodes. */
  children?: TaxonomyNode[];
}

// ─── FOOD ─────────────────────────────────────────────────────────────────

const food: TaxonomyNode = {
  key: 'food',
  name: 'Food',
  master: 'food',
  // Umbrella keywords — only fire when no more specific sub-cat keyword hits.
  keywords: [
    'food', 'pagkain', 'kain', 'kainan', 'kaon', 'kan-on', 'ulam', 'sinaing',
    'eat', 'ate', 'drink', 'drinks',
    // meal-time umbrellas
    'meal', 'meals', 'breakfast', 'lunch', 'dinner', 'brunch',
    'agahan', 'tanghalian', 'hapunan', 'merienda', 'meryenda',
    'pamahaw', 'paniudto', 'panihapon', 'painit', 'pangaon', 'bahog',
    // sides/starches
    'baon', 'kanin', 'rice', 'fried rice', 'java rice', 'garlic rice',
    'sinangag', 'noodles', 'pasta', 'pancake', 'waffle',
  ],
  children: [
    {
      key: 'coffee',
      name: 'Coffee',
      master: 'food',
      keywords: [
        'coffee', 'kape', 'starbucks', 'cbtl', 'coffee bean',
        'tims', 'tim hortons', 'dunkin', 'dunkin donuts',
        'krispy', 'krispy kreme',
      ],
    },
    {
      key: 'milk_tea',
      name: 'Milk Tea',
      master: 'food',
      keywords: [
        'milk tea', 'milktea', 'boba',
        'gong cha', 'gongcha', 'chatime', 'serenitea', 'cha',
      ],
    },
    {
      key: 'fast_food',
      name: 'Fast Food',
      master: 'food',
      keywords: [
        'jollibee', 'mcdo', 'mcdonalds', 'mc do', 'kfc',
        'chowking', 'greenwich', 'manginasal', 'mang inasal',
        'goldilocks', 'red ribbon', 'max restaurant', 'shakeys',
        'yellowcab', 'yellow cab', 'pizza hut', 'bonchon',
        'fastfood', 'fast food', 'food court',
        'burger', 'pizza',
      ],
    },
    {
      key: 'restaurant',
      name: 'Restaurant',
      master: 'food',
      keywords: [
        'restaurant', 'resto', 'cafe', 'cafeteria',
        'bakery', 'bakeshop', 'panaderia', 'carinderia',
      ],
    },
    {
      key: 'groceries',
      name: 'Groceries',
      master: 'food',
      keywords: [
        'grocery', 'groceries', 'palengke',
        // supermarket chains
        'sm', 'smmarket', 'sm market', 'smsupermarket', 'sm supermarket',
        'puregold', 'robinsons', 'robinsons supermarket',
        'rustans', 'rustans supermarket', 'shopwise',
        'landers', 'scash', 'savemore', 'waltermart',
        // convenience stores
        '7eleven', '7-eleven', '711', 'ministop',
        'alfamart', 'familymart', 'lawson',
      ],
    },
    {
      key: 'snacks',
      name: 'Snacks',
      master: 'food',
      keywords: [
        'snack', 'snacks',
        'donut', 'donuts', 'cake', 'pastry',
        'cookie', 'cookies', 'biscuit',
        'chocolate', 'candy', 'chips', 'popcorn',
        'ice cream', 'icecream', 'yogurt', 'smoothie',
      ],
    },
    {
      key: 'street_food',
      name: 'Street Food',
      master: 'food',
      keywords: [
        'taho', 'bibingka', 'puto', 'suman',
        'chicharon', 'balut', 'penoy',
        'kwek', 'kwek kwek', 'kwekkwek',
        'betamax', 'adidas', 'mami',
        'pandesal', 'pan de sal', 'ensaymada',
        'sago', 'gulaman', 'sago at gulaman',
        'fishball', 'isaw', 'halo-halo', 'buko', 'sorbetes',
      ],
    },
    {
      key: 'ph_dishes',
      name: 'Filipino Dishes',
      master: 'food',
      keywords: [
        'sisig', 'bulalo', 'kare-kare', 'karekare',
        'tinola', 'nilaga', 'pinakbet', 'paksiw', 'ginataan',
        'dinuguan', 'menudo', 'caldereta', 'kaldereta',
        'afritada', 'mechado', 'pancit', 'lumpia',
        'siomai', 'siopao', 'dimsum',
        'chicken inasal', 'inasal',
        'sinigang', 'adobo',
      ],
    },
    {
      key: 'ingredients',
      name: 'Ingredients',
      master: 'food',
      keywords: [
        // proteins
        'chicken', 'manok', 'fried chicken', 'roast chicken',
        'beef', 'baka', 'pork', 'baboy', 'liempo', 'lechon',
        'fish', 'isda', 'bangus', 'tilapia', 'tuna', 'salmon',
        'shrimp', 'hipon', 'itlog', 'egg', 'eggs',
        'bacon', 'hotdog', 'hot dog', 'ham',
        'longganisa', 'tocino', 'tapa', 'spam', 'sausage', 'karne',
        // produce
        'vegetable', 'vegetables', 'gulay', 'salad',
        'fruit', 'fruits', 'prutas',
        'mango', 'banana', 'saging', 'apple', 'orange', 'watermelon',
      ],
    },
    {
      key: 'drinks_alcohol',
      name: 'Drinks',
      master: 'food',
      keywords: [
        'juice', 'soda', 'soft drink', 'softdrink',
        'soft drinks', 'softdrinks', 'tea',
        'beer', 'alcohol', 'wine',
        'cocacola', 'coca cola', 'pepsi',
      ],
    },
  ],
};

// ─── TRANSPORT ────────────────────────────────────────────────────────────

const transport: TaxonomyNode = {
  key: 'transport',
  name: 'Transport',
  master: 'transport',
  keywords: [
    'transport', 'transpo', 'pasahe', 'pamasahe', 'plete',
    'sakay', 'sakyanan', 'fare', 'ride', 'commute',
  ],
  children: [
    {
      key: 'ride_hailing',
      name: 'Ride Hailing',
      master: 'transport',
      keywords: [
        'grab', 'grabcar', 'grabbike', 'grabtaxi',
        'taxi', 'uber', 'move', 'movit', 'indrive',
        'angkas', 'joyride',
      ],
    },
    {
      key: 'public_transit',
      name: 'Public Transit',
      master: 'transport',
      keywords: [
        'jeep', 'jeepney',
        'trike', 'tricycle', 'traysikol',
        'multi-cab', 'multicab',
        'bus', 'mrt', 'lrt', 'pnr',
        'habal', 'habal-habal', 'habalhabal',
        'ferry', 'boat', 'bangka',
        'uvexpress', 'uv express', 'beep',
      ],
    },
    {
      key: 'fuel',
      name: 'Fuel',
      master: 'transport',
      keywords: [
        'gas', 'petrol', 'gasoline', 'diesel', 'fuel',
        'shell', 'petron', 'caltex', 'phoenix',
        'seaoil', 'flying v', 'totalenergies',
      ],
    },
    {
      key: 'vehicle_upkeep',
      name: 'Vehicle Upkeep',
      master: 'transport',
      keywords: [
        'carwash', 'car wash', 'oil change',
        'tire', 'tires',
        'registration', 'lto', 'ltfrb',
        'motor', 'motorcycle', 'motorbike', 'scooter',
        'car', 'van',
      ],
    },
    {
      key: 'flights',
      name: 'Flights',
      master: 'transport',
      keywords: [
        'flight', 'cebupacific', 'cebu pacific',
        'pal', 'airasia', 'air asia', 'plane ticket',
      ],
    },
    {
      key: 'tickets',
      name: 'Tickets',
      master: 'transport',
      keywords: [
        'ticket', 'tickets',
        'bus ticket', 'train ticket', 'boat ticket',
        'ferry ticket', 'mrt ticket', 'lrt ticket',
      ],
    },
    {
      key: 'toll_parking',
      name: 'Toll & Parking',
      master: 'transport',
      keywords: ['toll', 'rfid', 'parking'],
    },
  ],
};

// ─── BILLS ────────────────────────────────────────────────────────────────

const bills: TaxonomyNode = {
  key: 'bills',
  name: 'Bills',
  master: 'bills',
  keywords: ['bill', 'bills'],
  children: [
    {
      key: 'telco',
      name: 'Telco',
      master: 'bills',
      keywords: [
        'load', 'eload', 'e-load', 'paload',
        'prepaid', 'postpaid',
        'pldt', 'globe', 'smart', 'sky', 'skycable',
        'converge', 'dito', 'tnt', 'tm', 'sun cellular',
      ],
    },
    {
      key: 'utilities',
      name: 'Utilities',
      master: 'bills',
      keywords: [
        'kuryente', 'suga',
        'meralco', 'veco', 'davao_light', 'davao light',
        'tubig', 'maynilad', 'manila_water', 'manila water',
        'water', 'electric', 'electricity',
      ],
    },
    {
      key: 'internet',
      name: 'Internet',
      master: 'bills',
      keywords: ['internet', 'wifi', 'piso wifi', 'pisonet'],
    },
    {
      key: 'subscriptions',
      name: 'Subscriptions',
      master: 'bills',
      keywords: [
        'subscription',
        'netflix', 'spotify', 'youtube', 'youtube premium',
        'apple music', 'icloud', 'google one',
        'hbo', 'disney', 'disney+', 'viu', 'iwant', 'vivamax',
        'prime', 'amazon prime',
      ],
    },
    {
      key: 'banks',
      name: 'Banking & E-Wallets',
      master: 'bills',
      keywords: [
        'bpi', 'bdo', 'unionbank', 'metrobank', 'pnb',
        'landbank', 'security bank', 'rcbc',
        'chinabank', 'eastwest',
        'gcash', 'paymaya', 'maya',
        'coins', 'coins.ph', 'grabpay',
        'bayad', 'bayad_center', 'bayad center',
      ],
    },
    {
      key: 'loans',
      name: 'Loans',
      master: 'bills',
      keywords: [
        'loan', 'utang', 'hulog',
        'amortization', 'amortisation',
        'home credit', 'cash loan',
        'mortgage',
      ],
    },
    {
      key: 'insurance_govt',
      name: 'Insurance & Gov',
      master: 'bills',
      keywords: [
        'insurance',
        'philhealth', 'pagibig', 'pag-ibig', 'sss',
      ],
    },
    {
      key: 'education',
      name: 'Tuition',
      master: 'bills',
      keywords: [
        'tuition', 'tuition fee', 'matricula',
        'school fee', 'miscellaneous fee',
      ],
    },
    {
      key: 'rent',
      name: 'Rent',
      master: 'bills',
      keywords: ['rent', 'upa', 'abang'],
    },
  ],
};

// ─── HEALTH ───────────────────────────────────────────────────────────────

const health: TaxonomyNode = {
  key: 'health',
  name: 'Health',
  master: 'health',
  keywords: [],
  children: [
    {
      key: 'pharmacy',
      name: 'Pharmacy',
      master: 'health',
      keywords: [
        'pharmacy', 'botika',
        'watsons', 'mercury', 'mercury drug',
        'generika', 'rose', 'rose pharmacy', 'southstar',
      ],
    },
    {
      key: 'medication',
      name: 'Medication',
      master: 'health',
      keywords: [
        'gamot', 'medisina', 'medicine', 'meds', 'tambal',
        'paracetamol', 'biogesic', 'alaxan', 'ibuprofen',
        'decolgen', 'bioflu', 'neozep', 'diatabs', 'loperamide',
        'prescription',
      ],
    },
    {
      key: 'medical_services',
      name: 'Medical Services',
      master: 'health',
      keywords: [
        'doctor', 'doktor', 'hospital', 'espital', 'ospital',
        'clinic', 'klinika',
        'dental', 'dentist',
        'checkup', 'check-up',
        'consult', 'consultation',
        'laboratory', 'lab',
        'x-ray', 'xray', 'ecg', 'ultrasound',
      ],
    },
    {
      key: 'vitamins',
      name: 'Vitamins',
      master: 'health',
      keywords: ['vitamins', 'vitamin', 'supplement', 'supplements'],
    },
    {
      key: 'dental_hygiene',
      name: 'Dental Hygiene',
      master: 'health',
      keywords: ['toothbrush', 'toothpaste', 'mouthwash'],
    },
  ],
};

// ─── SHOPPING ─────────────────────────────────────────────────────────────

const shopping: TaxonomyNode = {
  key: 'shopping',
  name: 'Shopping',
  master: 'shopping',
  keywords: ['shop', 'shopping'],
  children: [
    {
      key: 'ecommerce',
      name: 'E-commerce',
      master: 'shopping',
      keywords: [
        'shopee', 'lazada', 'zalora',
        'carousell', 'tiktok', 'tiktok shop', 'amazon',
      ],
    },
    {
      key: 'clothing',
      name: 'Clothing',
      master: 'shopping',
      keywords: [
        'damit', 'sapatos',
        'clothes', 'shirt', 'tshirt', 't-shirt',
        'pants', 'jeans', 'jacket', 'hoodie',
        'shoes', 'sneakers', 'slippers', 'tsinelas',
      ],
    },
    {
      key: 'retailers',
      name: 'Retailers',
      master: 'shopping',
      keywords: [
        'uniqlo', 'hm', 'h&m', 'zara',
        'bench', 'penshoppe',
        'ace', 'ace hardware',
        'miniso', 'daiso', 'jbl', 'ikea',
        'national bookstore', 'nbs', 'fully booked',
      ],
    },
    {
      key: 'markets',
      name: 'Markets',
      master: 'shopping',
      keywords: [
        'mall', 'divisoria', 'tiangge',
        'ukay', 'ukay-ukay', 'ukayukay',
        'thrift', 'tindahan',
      ],
    },
    {
      key: 'gadgets',
      name: 'Gadgets',
      master: 'shopping',
      keywords: ['gadget', 'gadgets', 'sulat', 'nota'],
    },
  ],
};

/** Top-level expense taxonomy. Income categories are not modeled here — they
 *  don't go through the keyword analyzer. */
export const TAXONOMY: TaxonomyNode[] = [
  food,
  transport,
  bills,
  health,
  shopping,
];
