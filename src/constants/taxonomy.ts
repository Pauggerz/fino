/**
 * Hierarchical category taxonomy — source of truth for offline keyword
 * categorization. Each master expense category is a tree of sub-categories.
 *
 * Each node carries TWO surface-form lists, both of which match the same
 * category but have different downstream behavior:
 *
 *   • `aliases`  — alternative names for the *category itself* (not a
 *     specific purchase). e.g. "school", "doctor", "gym", "restaurant".
 *     Match the category, but get filtered out of the formatted display
 *     name's item list (so "school enrollment" → "Bills - Enrollment",
 *     not "Bills - School Enrollment"). Filipino/Cebuano synonyms for
 *     the category (kape, tubig, kuryente, etc.) live here.
 *
 *   • `keywords` — specific brands, items, or services that *would*
 *     appear on a receipt as a line item. e.g. "Jollibee", "tuition fee",
 *     "Biogesic", "fitness first". Stay in the display-name item list.
 *
 * Rule of thumb: would this word appear as a line item on a receipt?
 *   Yes → `keywords`. No → `aliases`.
 *
 * The bubble-up resolver in `aiCategoryMap.ts` walks the matched node's
 * path from leaf → master and returns the first node whose `name` matches
 * one of the user's active categories (case-insensitive). That lets a
 * single keyword like "starbucks" resolve to "Coffee" if the user has that
 * custom category, "Food" if they only have the default, or fall through
 * to "Others" if they've deleted both.
 */

export type MasterCategory =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'health'
  | 'entertainment'
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
  /** Surface forms that name a specific *purchase*: a brand, item, or
   *  service. Match the category AND appear as items in the formatted
   *  display name. All lowercase. */
  keywords: string[];
  /** Surface forms that are alternative names for the *category itself* —
   *  not specific purchases. Match the category but get filtered from the
   *  display-name item list. */
  aliases?: string[];
  /** Optional sub-nodes. */
  children?: TaxonomyNode[];
}

// ─── FOOD ─────────────────────────────────────────────────────────────────

const food: TaxonomyNode = {
  key: 'food',
  name: 'Food',
  master: 'food',
  aliases: [
    // Generic verbs / umbrella nouns
    'food', 'pagkain', 'pagkaon', 'kain', 'kainan', 'kaon', 'kan-on',
    'ulam', 'eat', 'ate', 'eating', 'eats', 'drink', 'drinks',
    'meal', 'meals', 'breakfast', 'lunch', 'dinner', 'brunch',
    'agahan', 'tanghalian', 'hapunan', 'merienda', 'meryenda',
    'pamahaw', 'paniudto', 'panihapon', 'painit', 'pangaon', 'bahog',
    'baon',
  ],
  keywords: [
    // Specific carbs / breads — each could be a line item
    'kanin', 'rice', 'fried rice', 'java rice', 'garlic rice',
    'sinangag', 'sinaing', 'noodles', 'pasta', 'pancake', 'waffle',
    'bread', 'tinapay', 'pan', 'pan de sal', 'pandesal', 'loaf',
    'whole wheat', 'sandwich', 'sub', 'wrap', 'burrito', 'taco',
    'quesadilla',
  ],
  children: [
    {
      key: 'coffee',
      name: 'Coffee',
      master: 'food',
      aliases: ['coffee', 'kape', 'kapeng barako', 'brewed coffee', 'instant coffee', 'decaf'],
      keywords: [
        // Specific drink types
        'iced coffee', 'cold brew', 'espresso', 'americano',
        'latte', 'cafe latte', 'caffe latte', 'cappuccino', 'cap',
        'mocha', 'macchiato', 'flat white', 'frappuccino', 'frappe',
        'affogato', 'piccolo', 'cortado',
        // PH chains (brands)
        "bo's coffee", 'bos coffee', 'coffee project', 'kapetolyo',
        'local edition', 'figaro', "seattle's best", 'seattles best',
        'sbc', 'j.co', 'jco', 'gloria jeans', "toby's estate", 'tobys',
        'yardstick', 'civet coffee',
        // Global chains
        'starbucks', 'cbtl', 'coffee bean', 'tims', 'tim hortons',
        'dunkin', 'dunkin donuts', 'krispy', 'krispy kreme',
        "peet's coffee", 'peets coffee', 'blue bottle', 'dutch bros',
      ],
    },
    {
      key: 'milk_tea',
      name: 'Milk Tea',
      master: 'food',
      aliases: ['milk tea', 'milktea', 'cha', 'bubble tea', 'bubbletea', 'boba'],
      keywords: [
        // Toppings / flavors — line items
        'pearls', 'tapioca', 'brown sugar milk tea', 'taro milk tea',
        'wintermelon milk tea', 'fruit tea',
        // Brands
        'gong cha', 'gongcha', 'chatime', 'serenitea',
        'coco milk tea', 'macao imperial', 'macao', 'happy lemon',
        'tea story', 'tea republic', 'sharetea', 'dakasi', 'tiger sugar',
        'quickly', 'ten ren', 'ten-ren', 'yifang', 'heytea', 'hey tea',
        'kungfu tea', 'infinitea', 'partea', 'tealive', 'the alley',
        'xing fu tang', 'xingfutang', 'black cat latte',
      ],
    },
    {
      key: 'fast_food',
      name: 'Fast Food',
      master: 'food',
      aliases: ['fastfood', 'fast food', 'fast', 'food court'],
      keywords: [
        // Generic items
        'burger', 'pizza',
        // Filipino chains
        'jollibee', 'mcdo', 'mcdonalds', 'mc do', 'kfc', 'chowking',
        'greenwich', 'manginasal', 'mang inasal', 'goldilocks',
        'red ribbon', 'max restaurant', "max's restaurant", 'maxs',
        'shakeys', "shakey's", 'yellowcab', 'yellow cab', 'pizza hut',
        'bonchon', 'wendys', "wendy's", 'burger king', 'bk',
        'tropical hut', 'pancake house', 'army navy', 'army & navy',
        'andoks', "andok's", 'chicboy', 'chooks to go', 'chooks-to-go',
        'sinangag express', "rufo's", 'rufos', 'world chicken',
        "zark's", 'zarks', "zark's burgers", 'flamingwings',
        'kenny rogers', 'mary grace', 'cravings', 'barrio fiesta',
        'aristocrat', 'kamayan', "gerry's grill", 'gerrys grill',
        'manam', 'mesa', 'wildflour', 'purple oven', 'via mare',
        // Korean / Japanese chains
        'tonkatsu', 'yoshinoya', 'pepper lunch', 'marugame',
        'marugame udon', 'tokyo tokyo', 'teriyaki boy', 'mt fuji',
        'fuji ya', 'samurai japanese', 'little tokyo',
        // Pizza chains
        'papa johns', "papa john's", 'dominos', "domino's",
        's&r pizza', 's&r new york style', 'angels pizza',
        "angel's pizza", 'pizza inn', 'california pizza kitchen', 'cpk',
        // Other international
        'subway', 'quiznos', 'cinnabon', 'taco bell', 'dennys',
        "denny's", "applebee's", 'applebees', 'tgi', 'tgi fridays',
        "tgi friday's", 'outback', "tony romas", "tony roma's",
        'chilis', "chili's", 'red lobster', 'dairy queen', 'popeyes',
        'texas roadhouse', 'pollo loco', 'ihop', 'johnny rockets',
        'burger machine',
      ],
    },
    {
      key: 'restaurant',
      name: 'Restaurant',
      master: 'food',
      aliases: [
        // Venue types — alternative names for the category
        'restaurant', 'resto', 'cafe', 'cafeteria', 'bakery', 'bakeshop',
        'panaderia', 'carinderia', 'panciteria', 'kapehan', 'eatery',
        'tapsilogan', 'silogan', 'lutong bahay', 'home cooked',
        'home-cooked', 'restobar', 'gastropub', 'bistro', 'diner',
        'food park', 'foodpark', 'food hall', 'foodhall',
        'dampa', 'seafood market',
        'dine in', 'dine-in', 'take out', 'takeout', 'take-out',
      ],
      keywords: [
        // Specific meal styles / ordering modes that ARE the line item
        'omakase', 'buffet', 'eat all you can', 'eat-all-you-can',
        'unli', 'unli rice', 'unlimited rice',
      ],
    },
    {
      key: 'groceries',
      name: 'Groceries',
      master: 'food',
      aliases: [
        'grocery', 'groceries', 'palengke', 'wet market', 'talipapa',
        'bagsakan', 'sari-sari', 'sari sari', 'sarisari',
        'sari sari store', 'kanto', 'tindahan',
      ],
      keywords: [
        // Supermarket chains
        'sm', 'smmarket', 'sm market', 'smsupermarket', 'sm supermarket',
        'puregold', 'robinsons supermarket', 'rustans', 'rustans supermarket',
        'shopwise', 'landers', 'landers superstore', 'scash', 'savemore',
        'waltermart', 'walter mart', 'metro gaisano', 'gaisano',
        'gaisano grand', 'nccc', 'csi', 'hi-top', 'hi top', 'hitop',
        'wally market', 'prince', 'prince hypermart', 'pioneer center',
        'pioneer', 'tipid', 'wellcome', 'farmers market',
        's&r', 's and r', 's&r membership',
        // Convenience stores
        '7eleven', '7-eleven', '711', 'ministop', 'alfamart',
        'familymart', 'lawson', 'circle k', 'circle-k',
      ],
    },
    {
      key: 'snacks',
      name: 'Snacks',
      master: 'food',
      aliases: ['snack', 'snacks'],
      keywords: [
        // Generic snack items
        'donut', 'donuts', 'cake', 'pastry',
        'cookie', 'cookies', 'biscuit', 'chocolate', 'candy', 'gummy',
        'gummies', 'marshmallow', 'lollipop', 'licorice',
        'chips', 'popcorn', 'ice cream', 'icecream', 'yogurt', 'smoothie',
        // Chocolate brands
        'm&m', 'mnm', 'kit kat', 'kitkat', 'snickers', 'mars',
        'bounty', 'twix', 'oreo', 'chips ahoy', 'goya', 'hersheys',
        "hershey's", 'toblerone', 'cadbury', 'ferrero rocher',
        // Chip brands
        'pringles', 'lays', "lay's", 'doritos', 'cheetos', 'nips',
        'boy bawang', 'chippy', 'tortillos', 'clover', 'nova',
        'piattos', 'vcut', 'v cut', 'oishi', 'cracklings', 'cornick',
        'roller coaster', 'holiday', 'mr chips', 'pop',
        // PH sweets / kakanin
        'polvoron', 'pastillas', 'yema', 'sapin-sapin', 'sapinsapin',
        'kakanin', 'palitaw', 'biko', 'puto bumbong', 'kutsinta',
        'espasol', 'ube halaya', 'leche flan', 'tibok-tibok',
        'kalamay', 'pichi-pichi', 'pichi pichi', 'bibingkang malagkit',
      ],
    },
    {
      key: 'street_food',
      name: 'Street Food',
      master: 'food',
      aliases: ['street food'],
      keywords: [
        'taho', 'bibingka', 'puto', 'suman',
        'chicharon', 'balut', 'penoy',
        'kwek', 'kwek kwek', 'kwekkwek', 'tokneneng', 'tukneneng',
        'betamax', 'mami', 'fishball', 'isaw', 'bopis', 'bukayo',
        'pinipig', 'samalamig', 'palamig', 'gulaman',
        "sago't gulaman", 'sago at gulaman', 'sago',
        'halo-halo', 'halo halo', 'halohalo', 'buko', 'sorbetes',
        'dirty ice cream', 'mais con yelo', 'maiscon yelo', 'scramble',
        'tusok-tusok', 'tusoktusok', 'pinoy spaghetti',
      ],
    },
    {
      key: 'ph_dishes',
      name: 'Filipino Dishes',
      master: 'food',
      // Dishes are all line items — no general "Filipino dish" alias.
      keywords: [
        'sisig', 'bulalo', 'kare-kare', 'karekare',
        'tinola', 'nilaga', 'pinakbet', 'paksiw', 'ginataan',
        'dinuguan', 'menudo', 'caldereta', 'kaldereta', 'kalderetang baka',
        'afritada', 'mechado', 'pancit', 'pancit canton', 'pancit malabon',
        'pancit bihon', 'pancit luglog', 'lumpia', 'lumpiang shanghai',
        'lumpiang sariwa', 'lumpia ubod', 'siomai', 'siopao', 'dimsum',
        'chicken inasal', 'inasal', 'sinigang', 'adobo',
        'lechon kawali', 'crispy pata', 'kilawin', 'kinilaw', 'pochero',
        'embutido', 'escabeche', 'pinangat', 'laing', 'ginataang gulay',
        'monggo', 'tortang talong', 'tortang giniling', 'palabok',
        'lechon belly', 'bistek tagalog', 'pork bicol express',
        'bicol express', 'crispy kangkong', 'okoy', 'ukoy', 'spaghetti',
        'pinoy spaghetti', 'pinoy style spaghetti', 'bagnet',
        'vigan empanada', 'empanada', 'ilonggo batchoy', 'batchoy',
        'la paz batchoy', 'lapaz batchoy', 'tinapa', 'tuyo', 'daing',
      ],
    },
    {
      key: 'ingredients',
      name: 'Ingredients',
      master: 'food',
      aliases: ['ingredient', 'ingredients', 'sangkap'],
      keywords: [
        // Proteins
        'chicken', 'manok', 'fried chicken', 'roast chicken',
        'beef', 'baka', 'pork', 'baboy', 'liempo', 'lechon',
        'fish', 'isda', 'bangus', 'tilapia', 'tuna', 'salmon',
        'shrimp', 'hipon', 'itlog', 'egg', 'eggs',
        'bacon', 'hotdog', 'hot dog', 'ham',
        'longganisa', 'tocino', 'tapa', 'spam', 'sausage', 'karne',
        'crab', 'alimasag', 'alimango', 'squid', 'pusit', 'octopus',
        'clams', 'tahong', 'mussels', 'oyster', 'talaba', 'lobster',
        // Pantry / staples
        'flour', 'harina', 'sugar', 'asukal', 'salt', 'asin',
        'pepper', 'paminta', 'vinegar', 'suka', 'soy sauce', 'toyo',
        'fish sauce', 'patis', 'oil', 'cooking oil', 'mantika',
        'olive oil', 'coconut oil', 'vco',
        // Dairy
        'milk', 'gatas', 'fresh milk', 'oat milk', 'soy milk',
        'almond milk', 'condensed milk', 'evaporated milk',
        'gata', 'coconut milk', 'butter', 'margarine', 'cheese',
        'keso', 'eden cheese', 'kraft', 'velveeta', 'nestle',
        'bear brand', 'birch tree', 'nido', 'alaska', 'magnolia',
        // Sauces / condiments
        'tomato sauce', 'mayo', 'mayonnaise', 'ketchup',
        'banana ketchup',
        // Drinks / mixes
        'milo', 'ovaltine', 'nesquik', 'tang', 'four seasons',
        'chocolate drink', 'chocomilk', 'chocolate milk',
        // Produce
        'vegetable', 'vegetables', 'gulay', 'salad', 'fruit', 'fruits',
        'prutas', 'mango', 'banana', 'saging', 'apple', 'orange',
        'watermelon', 'tomato', 'kamatis', 'onion', 'sibuyas',
        'garlic', 'bawang', 'ginger', 'luya', 'potato', 'patatas',
        'carrot', 'kalabasa', 'squash', 'eggplant', 'talong', 'okra',
        'kangkong', 'pechay', 'mustasa', 'lettuce', 'cabbage',
        'repolyo', 'corn', 'mais', 'pineapple', 'pinya', 'papaya',
        'coconut', 'niyog',
      ],
    },
    {
      key: 'drinks_alcohol',
      name: 'Drinks',
      master: 'food',
      aliases: ['alcohol', 'liquor', 'spirits'],
      keywords: [
        // Generic drink types (line items: "I bought beer 100" → "Drinks - Beer")
        'beer', 'wine',
        'cocktail', 'mocktail', 'soft drink', 'softdrink',
        'soft drinks', 'softdrinks', 'soda', 'juice', 'tea',
        'iced tea', 'lemonade',
        // Water — specific bottled forms
        'mineral water', 'bottled water', 'water gallon', 'agua',
        'gallon', 'distilled water',
        // Soft drink brands
        'nestea', 'cocacola', 'coca cola', 'pepsi', 'coke',
        'sprite', 'royal', 'royal tru orange', 'mountain dew',
        'mtn dew', '7up', 'seven up', 'sarsi', 'pop cola',
        'mirinda', 'fanta', 'lipton', 'c2',
        // Energy
        'gatorade', 'pocari sweat', 'pocari', 'red bull', 'monster',
        'extra joss', 'cobra', 'cobra energy', 'sting',
        // Beer brands
        'red horse', 'san mig light', 'san miguel', 'sml',
        'pilsen', 'pale pilsen', 'corona', 'heineken', 'tiger beer',
        'asahi', 'kirin', 'sapporo', 'budweiser', 'guinness',
        // Spirits / liquors
        'red wine', 'white wine', 'champagne', 'prosecco', 'sake',
        'soju', 'lambanog', 'coconut wine',
        'vodka', 'gin', 'tanduay', 'gsm', 'ginebra', 'emperador',
        'tequila', 'rum', 'cognac', 'whiskey', 'whisky', 'bourbon',
        'johnnie walker', 'jw', 'jack daniels', "jack daniel's",
        'jameson', 'crown royal', 'chivas', 'glenfiddich', 'macallan',
      ],
    },
    {
      key: 'delivery',
      name: 'Food Delivery',
      master: 'food',
      aliases: ['food delivery', 'delivery', 'delivery fee'],
      keywords: [
        'foodpanda', 'food panda', 'grabfood', 'grab food',
        'pandamart', 'panda mart', 'pandahub', 'panda hub',
        'metromart', 'metro mart', 'pickaroo',
        'mcdo delivery', 'jollibee delivery', 'kfc delivery',
      ],
    },
  ],
};

// ─── TRANSPORT ────────────────────────────────────────────────────────────

const transport: TaxonomyNode = {
  key: 'transport',
  name: 'Transport',
  master: 'transport',
  aliases: [
    'transport', 'transpo', 'pasahe', 'pamasahe', 'plete',
    'sakay', 'sakyanan', 'fare', 'ride', 'commute',
    'byahe', 'biyahe', 'lakad',
  ],
  keywords: [],
  children: [
    {
      key: 'ride_hailing',
      name: 'Ride Hailing',
      master: 'transport',
      aliases: ['ride hailing', 'rideshare', 'taxi'],
      keywords: [
        'grab', 'grabcar', 'grabbike', 'grabtaxi', 'grabexpress',
        'grab express', 'uber', 'move', 'movit', 'indrive',
        'angkas', 'joyride', 'lalamove', 'transportify', 'mover',
        'mr speedy', 'mrspeedy', 'borzo', 'easy taxi', 'easytaxi',
        'lyft', 'careem', 'bolt', 'gojek', 'maxim',
      ],
    },
    {
      key: 'public_transit',
      name: 'Public Transit',
      master: 'transport',
      aliases: ['public transit', 'public transport'],
      keywords: [
        // Local transit (specific modes)
        'jeep', 'jeepney', 'trike', 'tricycle', 'traysikol',
        'multi-cab', 'multicab', 'bus', 'mrt', 'lrt', 'pnr',
        'habal', 'habal-habal', 'habalhabal', 'ferry', 'boat',
        'bangka', 'uvexpress', 'uv express', 'beep', 'beep card',
        'kalesa', 'calesa', 'fx', 'auv',
        'e-jeep', 'ejeep', 'e-trike', 'etrike', 'e-bike', 'ebike',
        'p2p', 'point-to-point', 'point to point', 'edsa carousel',
        'edsa bus', 'brt',
        // Bus lines (brands)
        'tour bus', 'victory liner', 'philtranco', 'joybus', 'joy bus',
        'jam liner', 'genesis', 'partas', 'dagupan bus',
        'cherry bus', 'solid north', 'superlines', 'dimple star',
      ],
    },
    {
      key: 'fuel',
      name: 'Fuel',
      master: 'transport',
      aliases: ['fuel', 'gas', 'gasoline', 'petrol'],
      keywords: [
        'diesel', 'shell', 'petron', 'caltex', 'phoenix', 'seaoil',
        'flying v', 'totalenergies', 'total', 'total energy',
        'unioil', 'cleanfuel', 'clean fuel', 'jetti',
        'eastern petroleum', 'bluegas',
        'gasul', 'lpg', 'liquefied petroleum', 'propane',
        'kerosene', 'diesel oil', 'octane 91', 'octane 95',
        'octane 97', 'unleaded', 'premium gas', 'super premium',
        'auto lpg',
      ],
    },
    {
      key: 'vehicle_upkeep',
      name: 'Vehicle Upkeep',
      master: 'transport',
      aliases: [
        'vehicle upkeep', 'maintenance',
        'mechanic', 'mekaniko', 'talyer', 'casa', 'casa service',
        'repair', 'pa-repair', 'parepair', 'paayos', 'pa-ayos',
      ],
      keywords: [
        // Generic vehicle items
        'motor', 'motorcycle', 'motorbike', 'scooter', 'car', 'van',
        // Specific services
        'carwash', 'car wash', 'oil change', 'tire', 'tires',
        'repaint', 'paint job', 'body shop', 'tinsmith', 'tinsmithing',
        'detailing', 'auto detailing', 'tune up', 'tune-up',
        'change oil', 'brake pads', 'brake fluid', 'tire patching',
        'tirepatching', 'vulcanize', 'vulcanizing', 'bulkanise',
        'wheel alignment', 'alignment', 'balancing',
        'battery', 'motolite', 'amaron', 'varta',
        'coolant', 'freon', 'aircon repair', 'pms',
        'periodic maintenance', 'tire change', 'tire shop',
        'michelin', 'bridgestone', 'goodyear', 'dunlop',
        'yokohama', 'westlake', 'pirelli', 'accelera', 'monroe', 'kyb',
        // Registration / license
        'registration', 'lto', 'ltfrb', 'or', 'or/cr', 'or cr',
        'inspection sticker', 'inspection', 'emission test', 'emission',
        'private vehicle', 'puv', 'franchise', 'garage',
      ],
    },
    {
      key: 'flights',
      name: 'Flights',
      master: 'transport',
      aliases: ['flight', 'airfare', 'airline', 'plane', 'airport'],
      keywords: [
        // Specific items
        'plane ticket', 'terminal fee', 'travel tax', 'airport tax',
        // Local airports
        'naia', 'clark', 'mactan', 'cebu airport', 'davao airport',
        'iloilo airport',
        // Local airlines
        'cebupacific', 'cebu pacific', 'cebu pac', 'pal',
        'philippine airlines', 'airasia', 'air asia',
        // International airlines
        'singapore airlines', 'cathay pacific', 'cathay', 'jal',
        'japan airlines', 'ana', 'all nippon', 'korean air',
        'qantas', 'emirates', 'etihad', 'qatar airways', 'qatar',
        'turkish airlines', 'turkish', 'lufthansa', 'klm',
        'british airways', 'american airlines', 'delta',
        'united airlines', 'united', 'southwest', 'tigerair', 'scoot',
        'royal brunei', 'garuda', 'ryanair', 'easyjet',
        'vietnam airlines', 'vietjet', 'thai airways', 'thai',
        'eva air', 'china airlines', 'china southern',
        'china eastern', 'air china',
      ],
    },
    {
      key: 'tickets',
      name: 'Tickets',
      master: 'transport',
      aliases: ['ticket', 'tickets'],
      keywords: [
        'bus ticket', 'train ticket', 'boat ticket',
        'ferry ticket', 'mrt ticket', 'lrt ticket',
        'boat fare', 'bus fare', 'train fare', 'mrt fare', 'lrt fare',
        'port fee', 'wharf fee',
      ],
    },
    {
      key: 'toll_parking',
      name: 'Toll & Parking',
      master: 'transport',
      aliases: ['toll', 'parking', 'paid parking', 'pay parking'],
      keywords: [
        'rfid',
        'nlex', 'slex', 'cavitex', 'mcx', 'skyway', 'tplex',
        'easytrip', 'easy trip', 'autosweep', 'auto sweep',
        'valet', 'valet parking',
        'parking fee', 'metered parking', 'parking lot',
      ],
    },
  ],
};

// ─── BILLS ────────────────────────────────────────────────────────────────

const bills: TaxonomyNode = {
  key: 'bills',
  name: 'Bills',
  master: 'bills',
  aliases: ['bill', 'bills', 'bayad'],
  keywords: [],
  children: [
    {
      key: 'telco',
      name: 'Telco',
      master: 'bills',
      aliases: [
        'telco', 'prepaid', 'postpaid',
      ],
      keywords: [
        // Specific products / actions (line items)
        'load', 'eload', 'e-load', 'paload',
        'top up', 'topup', 'top-up', 'recharge',
        'data plan', 'mobile data', 'unli call', 'unli text',
        'unli data', 'unlimited data', 'unlimited call',
        // Specific telcos / providers
        'pldt', 'globe', 'smart', 'dito', 'tnt', 'tm', 'sun cellular',
        'eastern communications', 'etpi',
        'sky', 'skycable', 'cignal', 'converge',
      ],
    },
    {
      key: 'utilities',
      name: 'Utilities',
      master: 'bills',
      aliases: [
        'utility', 'utilities',
        'kuryente', 'suga', 'tubig', 'water', 'electric', 'electricity',
      ],
      keywords: [
        // Specific bill names (line items)
        'electricity bill', 'water bill', 'power bill',
        // Specific utility providers
        'meralco', 'veco', 'davao_light', 'davao light', 'cepalco',
        'dlpc', 'cagayan electric', 'ngcp',
        'maynilad', 'manila_water', 'manila water',
        'mwss', 'iloilo water', 'subic water', 'cebu water district',
      ],
    },
    {
      key: 'internet',
      name: 'Internet',
      master: 'bills',
      aliases: [
        'internet', 'wifi', 'fiber', 'fibr', 'fiber internet',
        'fiber connection', 'home internet',
      ],
      keywords: [
        // Specific products / providers (line items)
        'piso wifi', 'pisonet',
        'globe fiber', 'globe at home', 'pldt fibr', 'pldt home',
        'sky broadband', 'sky internet', 'streamtech', 'redfiber',
        'rise', 'rise internet', 'we are it', 'tonik internet',
        'airtech', 'airrise',
      ],
    },
    {
      key: 'subscriptions',
      name: 'Subscriptions',
      master: 'bills',
      aliases: [
        'subscription', 'membership', 'membership fee',
        'monthly subscription', 'monthly fee', 'monthly dues',
        'auto-renew', 'recurring',
      ],
      keywords: [
        // Streaming — video
        'netflix', 'youtube', 'youtube premium', 'hbo', 'disney',
        'disney+', 'viu', 'iwant', 'vivamax', 'prime',
        'amazon prime', 'crunchyroll', 'funimation', 'paramount+',
        'paramount plus', 'apple tv+', 'apple tv plus', 'appletv',
        'discovery+', 'discovery plus', 'hulu', 'showmax', 'britbox',
        'curiosity stream', 'curiosity+', 'mubi', 'criterion channel',
        'tubi', 'peacock', 'pluto',
        // Streaming — music
        'spotify', 'apple music', 'tidal', 'deezer', 'soundcloud',
        'soundcloud go', 'bandcamp', 'audible', 'audible plus',
        // Cloud / storage
        'icloud', 'google one', 'dropbox', 'dropbox plus',
        'onedrive', 'box', 'mega', 'pcloud', 'sync.com', 'backblaze',
        // Gaming subscriptions
        'xbox game pass', 'gamepass', 'game pass', 'playstation plus',
        'ps plus', 'ps+', 'psn', 'nintendo online',
        'nintendo switch online', 'steam', 'epic games', 'ea play',
        'ea origin', 'ubisoft+', 'ubisoft plus',
        // Productivity / SaaS
        'microsoft 365', 'office 365', 'o365', 'google workspace',
        'gsuite', 'g suite', 'adobe creative cloud', 'adobe cc',
        'creative cloud', 'notion', 'notion ai', 'bear', 'day one',
        'things 3', 'chatgpt', 'chatgpt plus', 'openai', 'claude pro',
        'claude.ai', 'anthropic', 'midjourney', 'github copilot',
        'copilot', 'github', 'gitlab', 'bitbucket', 'figma',
        'figma pro', 'framer', 'webflow', 'wix', 'squarespace',
        'wordpress', 'shopify', 'linear', 'trello', 'asana',
        'clickup', 'monday', 'monday.com', 'slack', 'discord nitro',
        'zoom', 'zoom pro', 'protonmail', 'proton mail', 'fastmail',
        'calendly', 'patreon', 'substack', 'medium', 'pocket',
        'grammarly', 'grammarly premium', 'deepl', 'deepl pro',
        'quillbot',
        // VPN / security
        'surfshark', 'nordvpn', 'nord vpn', 'expressvpn', 'protonvpn',
        'proton vpn', 'bitwarden', '1password', 'lastpass',
        'dashlane', 'keeper',
        // Dev tooling
        'cloudflare', 'cloudflare pro', 'tailscale', 'netlify',
        'vercel', 'replit', 'codespaces', 'jetbrains', 'intellij',
        'pycharm', 'webstorm',
        // Design
        'sketch', 'procreate', 'affinity', 'canva', 'canva pro',
        'invision', 'marvel',
        // Wellness apps
        'headspace', 'calm', 'nike training club', 'nike run club',
        'peloton', 'apple fitness', 'fitness+',
        // Online learning
        'duolingo', 'duolingo plus', 'babbel', 'memrise',
        'rosetta stone', 'coursera', 'coursera plus', 'udemy',
        'skillshare', 'masterclass', 'khan academy', 'brilliant',
        'nebula',
      ],
    },
    {
      key: 'banks',
      name: 'Banking & E-Wallets',
      master: 'bills',
      aliases: ['bank', 'banking', 'e-wallet', 'ewallet'],
      keywords: [
        // Local banks
        'bpi', 'bdo', 'unionbank', 'metrobank', 'pnb',
        'landbank', 'security bank', 'rcbc', 'chinabank', 'eastwest',
        'cimb', 'cimb bank', 'tonik', 'tonik bank', 'gotyme',
        'gotyme bank', 'seabank', 'sea bank', 'ing', 'ing bank',
        'bank of commerce', 'boc', 'wealth bank', 'sterling bank',
        'robinsons bank', 'aub', 'asia united bank', 'komo',
        'diskartech', 'ofbank', 'psbank', 'psb',
        'philippine savings bank', 'pbb', 'philippine business bank',
        'producers bank', 'bdo network bank', 'bdo unibank',
        'bpi family savings', 'bpi family', 'dbp', 'development bank',
        // International banks
        'bank of america', 'boa', 'chase', 'chase bank',
        'citibank', 'citi', 'hsbc', 'hsbc bank', 'standard chartered',
        'scb',
        // E-wallets
        'gcash', 'paymaya', 'maya', 'coins', 'coins.ph', 'grabpay',
        'wise', 'transferwise', 'revolut', 'paypal', 'pay pal',
        'payoneer',
        // Bayad centers
        'bayad_center', 'bayad center',
      ],
    },
    {
      key: 'remittance',
      name: 'Remittance',
      master: 'bills',
      aliases: [
        'remittance', 'padala', 'pera padala', 'pera-padala',
        'pa-padala',
      ],
      keywords: [
        'lbc', 'lbc remittance', 'lbc express',
        'cebuana', 'cebuana lhuillier',
        'm lhuillier', 'm. lhuillier', 'mlhuillier',
        'palawan express', 'palawan pawnshop', 'palawan',
        'western union', 'wu', 'moneygram', 'xoom', 'remitly',
        'worldremit', 'world remit',
        '2go pera', 'jrs express', 'jrs', 'air21', 'xpresshub',
      ],
    },
    {
      key: 'loans',
      name: 'Loans',
      master: 'bills',
      aliases: [
        'loan', 'utang', 'hulog',
        'paluwagan', 'bombay', 'bombay 5-6', '5-6', '5/6',
        'loan shark', 'pawn', 'sangla', 'sanglaan',
        'pawn shop', 'pawnshop',
      ],
      keywords: [
        // Specific loan products (line items)
        'amortization', 'amortisation', 'mortgage', 'cash loan',
        'home loan', 'housing loan', 'personal loan', 'salary loan',
        'multi-purpose loan', 'mpl', 'cash advance', 'auto loan',
        // Specific lenders / fintech apps
        'home credit',
        'tala', 'cashalo', 'atome', 'akulaku', 'billease', 'bill ease',
        'plentina', 'ziploan', 'gloan', 'g-loan', 'g loan',
        'gcredit', 'gcash credit', 'maya credit', 'maya loan',
        'tonik loan', 'pera asia', 'bpi auto loan',
      ],
    },
    {
      key: 'insurance_govt',
      name: 'Insurance & Gov',
      master: 'bills',
      aliases: ['insurance', 'tax', 'taxes'],
      keywords: [
        // Specific tax types (line items)
        'tax payment', 'income tax', 'corporate tax', 'business tax',
        'vat', 'value added tax',
        'withholding', 'withholding tax',
        'dst', 'documentary stamp tax',
        // License / passport (paid events)
        'professional license',
        'passport', 'passport renewal', 'passport fee',
        // Insurance companies
        'pru life uk', 'pru', 'prudential',
        'aia', 'aia philam', 'philam', 'philam life',
        'sun life', 'sunlife', 'manulife', 'manu life', 'allianz',
        'pnb life', 'bpi-aia', 'bpi aia', 'bdo life', 'fwd',
        'fwd life', 'generali', 'insular life', 'singlife',
        'singapore life', 'standard insurance', 'malayan insurance',
        'malayan', 'mercantile', 'charter ping an', 'cppi',
        // Gov contributions
        'philhealth', 'pagibig', 'pag-ibig', 'sss', 'gsis',
        'bir', 'bir tax',
        // Clearances / IDs (specific certs are line items)
        'nbi', 'nbi clearance', 'psa', 'psa birth certificate',
        'psa marriage', 'barangay clearance', 'barangay cert',
        'barangay certificate', 'barangay id', 'pnp clearance',
        'police clearance', 'dfa', 'prc', 'prc id',
      ],
    },
    {
      key: 'education',
      name: 'Education',
      master: 'bills',
      aliases: [
        // The user's example: "school" is the alternative name for the
        // category itself — not a purchasable item. These are generic
        // venue / level / scope words that name the Education category.
        'school', 'paaralan', 'eskwelahan', 'klase', 'class', 'classes',
        'subject', 'subjects', 'course', 'courses',
        'college', 'university', 'unibersidad',
        'kindergarten', 'kinder', 'elementary', 'high school',
        'senior high', 'senior high school', 'shs', 'junior high',
        'daycare',
      ],
      keywords: [
        // Specific items / fees / paid events — these ARE line items.
        'tuition', 'tuition fee', 'matricula', 'school fee',
        'miscellaneous fee',
        'enrollment', 'enroll', 'enrolment',
        'tutorial', 'tutoring', 'tutor', 'pa-tutor',
        'training', 'seminar', 'webinar', 'workshop',
        'online learning', 'online class', 'e-learning', 'online course',
        'school supplies', 'school uniform', 'uniform',
        'book', 'books', 'textbook', 'textbooks', 'notebook',
        'crayons', 'pencil', 'pen', 'paper', 'bond paper',
        'review center', 'review', 'coaching',
        'certification', 'cert',
        'examination fee', 'exam fee', 'entrance exam', 'pet',
        'nmat', 'lae', 'upcat', 'bar exam', 'cpa exam',
        'licensure', 'licensure exam', 'ielts', 'toefl',
        'gmat', 'gre',
      ],
    },
    {
      key: 'rent',
      name: 'Rent',
      master: 'bills',
      aliases: [
        'rent', 'upa', 'abang', 'renta', 'lease',
        'apartment',
        'dorm', 'dormitory', 'boarding house',
        'bedspace', 'bed-space', 'bed space',
      ],
      keywords: [
        // Specific rent payments / charges (line items)
        'monthly rent', 'house rent', 'room rent', 'pa-rent',
        'pa-renta', 'bayad sa kuwarto',
        'condo rent', 'condo rental', 'apartment rent',
        'deposit', 'advance', 'advance rent', 'security deposit',
        'association dues', 'condominium dues', 'condo dues',
        'hoa', 'homeowner dues', 'village dues', 'assoc dues',
      ],
    },
  ],
};

// ─── HEALTH ───────────────────────────────────────────────────────────────

const health: TaxonomyNode = {
  key: 'health',
  name: 'Health',
  master: 'health',
  aliases: ['health'],
  keywords: [],
  children: [
    {
      key: 'pharmacy',
      name: 'Pharmacy',
      master: 'health',
      aliases: [
        'pharmacy', 'botika', 'drugstore', 'health and beauty store',
        'chinese drugstore', 'botika ng bayan', 'botika ng barangay',
      ],
      keywords: [
        'watsons', 'mercury', 'mercury drug',
        'generika', 'rose', 'rose pharmacy', 'southstar',
        'three sixty pharmacy', '360 pharmacy',
        'the generics pharmacy', 'tgp',
        'pulse pharmacy', 'pulse philippines',
      ],
    },
    {
      key: 'medication',
      name: 'Medication',
      master: 'health',
      aliases: [
        'medicine', 'meds', 'medisina', 'gamot', 'tambal',
        'prescription',
        'cough', 'cough medicine', 'ubo', 'ubo gamot',
        'cold medicine', 'flu medicine', 'fever', 'lagnat',
        'headache', 'sakit ng ulo', 'migraine',
        'antibiotic', 'antibiotics', 'antihistamine', 'antacid',
      ],
      keywords: [
        // Specific drugs
        'paracetamol', 'biogesic', 'alaxan', 'ibuprofen',
        'decolgen', 'bioflu', 'neozep', 'diatabs', 'loperamide',
        'omeprazole', 'simvastatin', 'metformin', 'losartan',
        'amlodipine', 'atenolol', 'cetirizine', 'loratadine',
        'kremil-s', 'kremils', 'gaviscon', 'imodium', 'panadol',
        'advil', 'aspirin', 'efferalgan', 'tuseran', 'tuseran forte',
        // Topicals / first aid (brand names + specific items)
        'betadine', 'iodine', 'efficascent', 'efficascent oil',
        'white flower', 'vicks', 'vicks vaporub', 'mentholatum',
        'eucalyptus oil', 'peppermint oil', 'menthol',
        'katinko', 'omega pain killer', 'salonpas', 'tiger balm',
        // Supplies
        'bandage', 'band-aid', 'bandaid', 'gauze', 'cotton balls',
        'cotton', 'alcohol pads',
        'rubbing alcohol', 'isopropyl alcohol', 'ethyl alcohol',
        'hand sanitizer', 'sanitizer', 'face mask', 'surgical mask',
        'n95', 'kn95', 'face shield',
        // Devices
        'thermometer', 'digital thermometer',
        'bp monitor', 'blood pressure monitor',
        'glucometer', 'glucose meter', 'pulse oximeter',
        'nebulizer', 'inhaler', 'salbutamol', 'ventolin',
      ],
    },
    {
      key: 'medical_services',
      name: 'Medical Services',
      master: 'health',
      aliases: [
        // Provider / venue / specialist roles — alternative names for the
        // category. Not specific paid events.
        'medical services',
        'doctor', 'doktor', 'hospital', 'espital', 'ospital',
        'clinic', 'klinika',
        'dental', 'dentist',
        'laboratory', 'lab',
        'mental health',
        // Specialist roles (provider, not a service)
        'psychiatrist', 'therapist', 'counselor', 'counsellor',
        'psychologist',
        'optometrist', 'optometry', 'ophthalmologist',
        'dermatologist', 'dermo', 'pediatrician', 'pedia',
        'cardiologist', 'obgyn', 'ob-gyn', 'obstetrician',
        'gynecologist', 'surgeon', 'internist',
        'gastroenterologist', 'urologist', 'neurologist',
        'pulmonologist', 'endocrinologist', 'radiologist',
        'orthodontist',
      ],
      keywords: [
        // Paid events / sessions / services (line items)
        'checkup', 'check-up', 'consult', 'consultation',
        'surgery', 'operation', 'op', 'procedure',
        'therapy', 'physical therapy', 'pt', 'ot',
        'occupational therapy', 'speech therapy', 'psychotherapy',
        'counseling',
        'eye exam', 'eye check up', 'eye check-up',
        'dental check', 'dental check-up', 'dental checkup',
        'dental visit',
        'vaccination', 'vaccine', 'vax', 'bakuna', 'shot',
        'pa-bakuna', 'immunization', 'immunisation',
        // Specific tests / procedures
        'mri', 'ct scan', 'ct-scan', 'ctscan',
        'endoscopy', 'colonoscopy', 'biopsy', 'ultrasound',
        'x-ray', 'xray', 'ecg',
        'cbc', 'complete blood count', 'urinalysis', 'urin test',
        'fecalysis', 'pap smear', 'mammogram', 'mammography',
        // Specific dental procedures
        'pa-pasta', 'tooth filling', 'cleaning', 'dental cleaning',
        'extraction', 'tooth extraction', 'root canal',
        'wisdom tooth', 'wisdom teeth',
        'scaling', 'prophylaxis', 'oral prophylaxis',
        'braces', 'dental braces', 'retainer',
      ],
    },
    {
      key: 'vitamins',
      name: 'Vitamins',
      master: 'health',
      aliases: ['vitamins', 'vitamin', 'supplement', 'supplements', 'multivitamin', 'multivitamins'],
      keywords: [
        // Brands
        'centrum', 'centrum advance', 'revicon', 'enervon',
        'enervon c', 'conzace', 'nutrilite', 'usana', 'lifepak',
        'clusivol', 'propan', 'tiki tiki',
        // Specific vitamins / nutrients
        'ascorbic acid', 'vitamin c', 'vit c', 'vitamin d',
        'vitamin d3', 'vitamin b complex', 'vitamin b',
        'vitamin e', 'vitamin a', 'vitamin k',
        'calcium', 'calcium tablets', 'iron', 'ferrous sulfate',
        'zinc', 'zinc tablets', 'magnesium',
        'omega 3', 'omega-3', 'fish oil', 'cod liver oil',
        'probiotics', 'probiotic',
        'collagen', 'biotin', 'glutathione', 'gluta',
        'garlic capsule', 'melatonin', 'ginseng',
        'chia seeds', 'spirulina',
        // Sports / fitness
        'whey protein', 'whey', 'protein powder', 'protein shake',
        'mass gainer', 'meal replacement', 'creatine', 'bcaa',
        'pre-workout',
      ],
    },
    {
      key: 'dental_hygiene',
      name: 'Dental Hygiene',
      master: 'health',
      aliases: ['dental hygiene'],
      keywords: [
        'toothbrush', 'toothpaste', 'mouthwash',
        'dental floss', 'floss',
        'dentures', 'dental kit',
        'colgate', 'close-up', 'closeup', 'sensodyne',
        'oral b', 'oral-b', 'crest',
      ],
    },
  ],
};

// ─── SHOPPING ─────────────────────────────────────────────────────────────

const shopping: TaxonomyNode = {
  key: 'shopping',
  name: 'Shopping',
  master: 'shopping',
  aliases: ['shop', 'shopping'],
  keywords: [],
  children: [
    {
      key: 'ecommerce',
      name: 'E-commerce',
      master: 'shopping',
      aliases: ['ecommerce', 'e-commerce', 'online shopping', 'online store'],
      keywords: [
        'shopee', 'lazada', 'zalora',
        'carousell', 'tiktok', 'tiktok shop', 'amazon',
        'shein', 'temu', 'wish', 'aliexpress', 'ali-express',
        'ebay', 'etsy', 'mercari',
        'grabmart', 'grab mart',
        'argomall', 'cd-r king', 'cdr king', 'octagon',
        'abenson', 'western appliances', 'automatic centre',
        'appliance store',
      ],
    },
    {
      key: 'clothing',
      name: 'Clothing',
      master: 'shopping',
      aliases: ['clothing', 'damit', 'clothes', 'sapatos', 'shoes', 'apparel'],
      keywords: [
        // Specific item types
        'shirt', 'tshirt', 't-shirt',
        'pants', 'slacks', 'khaki', 'khakis',
        'jeans', 'jacket', 'hoodie',
        'sneakers', 'slippers', 'tsinelas',
        // Underwear / inner
        'lingerie', 'underwear', 'socks', 'medyas', 'brief', 'briefs',
        'panties', 'bra', 'sport bra', 'sports bra',
        // Accessories
        'belt', 'sinturon', 'hat', 'cap', 'kupya',
        'scarf', 'bandana', 'gloves', 'mittens',
        // Outerwear
        'sweater', 'cardigan', 'blazer', 'suit',
        'barong', 'barong tagalog', 'tie', 'necktie', 'bow tie',
        // Dresses / bottoms
        'dress', 'gown', 'costume', 'skirt', 'palda',
        'shorts', 'jorts', 'leggings', 'tights',
        // Swimwear / sleepwear
        'swimsuit', 'bathing suit', 'swimwear', 'bikini', 'trunks',
        'swim trunks', 'robe', 'bathrobe', 'pajamas', 'pyjamas',
        'pijama', 'kimono',
        // Bags
        'bag', 'backpack', 'tote', 'tote bag', 'sling', 'sling bag',
        'purse', 'handbag', 'wallet', 'coin purse',
        // Jewelry / watch
        'watch', 'wristwatch', 'relo', 'relos',
        'jewelry', 'jewellery', 'alahas',
        'ring', 'singsing', 'necklace', 'kuwintas',
        'earring', 'earrings', 'hikaw',
        'bracelet', 'pulseras', 'anklet',
        'sunglasses', 'eyeglasses', 'salamin sa mata', 'glasses',
        'contact lens', 'contact lenses',
      ],
    },
    {
      key: 'retailers',
      name: 'Retailers',
      master: 'shopping',
      aliases: ['retailer', 'retailers', 'department store'],
      keywords: [
        // Local / department
        'uniqlo', 'hm', 'h&m', 'zara', 'bench', 'penshoppe',
        'ace', 'ace hardware', 'miniso', 'daiso', 'ikea',
        'national bookstore', 'nbs', 'fully booked',
        'mr diy', 'mr.diy', 'mr. diy', 'decathlon', 'anytime fitness',
        'plains and prints', 'plains & prints', 'kamiseta',
        'folded & hung', 'folded and hung', 'f&h', 'forme',
        // Footwear
        'crocs', 'nike', 'adidas', 'puma', 'reebok', 'asics',
        'new balance', 'onitsuka tiger', 'onitsuka',
        'vans', 'converse', 'skechers', 'sperry', 'toms',
        'birkenstock', 'havaianas', 'native',
        // Apparel
        'mango', 'gap', 'old navy', 'banana republic',
        "levi's", 'levis', 'wrangler', 'lee', 'diesel',
        'calvin klein', 'ck', 'tommy hilfiger', 'tommy',
        'polo ralph lauren', 'polo', 'lacoste',
        'hugo boss', 'armani',
        // Luxury
        'gucci', 'louis vuitton', 'lv', 'prada', 'hermes',
        'coach', 'michael kors', 'mk', 'kate spade', 'fossil',
        'chanel', 'cartier', 'tiffany', 'swarovski',
        // Watches / wearables
        'suunto', 'fitbit', 'garmin', 'casio', 'seiko', 'citizen',
        'daniel wellington', 'dw', 'amazfit',
        // Audio brands
        'jbl', 'beats', 'bose', 'sennheiser', 'anker',
      ],
    },
    {
      key: 'markets',
      name: 'Markets',
      master: 'shopping',
      aliases: [
        'mall', 'tiangge', 'tianggehan', 'tabo',
        'bazaar', 'flea market', 'flea',
        'second hand', 'secondhand', 'garage sale',
        'swap meet', 'thrift', 'ukay', 'ukay-ukay', 'ukayukay',
        'divisoria',
      ],
      keywords: [],
    },
    {
      key: 'gadgets',
      name: 'Gadgets',
      master: 'shopping',
      aliases: ['gadget', 'gadgets', 'sulat', 'nota'],
      keywords: [
        // Phones
        'phone', 'smartphone', 'cellphone', 'cell phone',
        'mobile phone', 'iphone', 'ipad', 'tablet',
        'apple watch', 'airpods', 'airpod',
        'samsung', 'galaxy', 'galaxy s', 'galaxy note', 'galaxy fold',
        'xiaomi', 'redmi', 'mi', 'oppo', 'vivo', 'realme',
        'huawei', 'honor', 'sony', 'lg phone',
        // Computers
        'laptop', 'desktop', 'pc', 'macbook', 'imac', 'mac mini',
        'mac pro', 'mac studio', 'monitor',
        'keyboard', 'mouse', 'headphones', 'headphone',
        'earphones', 'earbuds', 'tws', 'bluetooth speaker',
        'speaker', 'headset',
        // Gaming hardware
        'gaming pc', 'gaming console', 'console',
        'playstation', 'ps4', 'ps5', 'xbox', 'xbox series',
        'xbox one', 'nintendo', 'nintendo switch', 'switch',
        'controller', 'joystick', 'gamepad',
        // Accessories
        'cable', 'usb cable', 'lightning cable', 'usb-c', 'usb c',
        'type-c', 'type c', 'charger', 'phone charger',
        'laptop charger', 'adapter', 'wall adapter',
        'powerbank', 'power bank', 'dongle', 'hub', 'usb hub',
        'ssd', 'hdd', 'external drive', 'external hdd',
        'external ssd', 'usb', 'flash drive', 'memory card',
        'microsd', 'sd card', 'sandisk', 'kingston', 'seagate',
        'western digital', 'wd',
      ],
    },
    {
      key: 'personal_care',
      name: 'Personal Care',
      master: 'shopping',
      aliases: [
        'personal care',
        'beauty products', 'cosmetics', 'skincare', 'skin care',
        'makeup', 'make up',
        'salon', 'barber', 'spa',
      ],
      keywords: [
        // Hair / body items
        'shampoo', 'conditioner', 'soap', 'body wash', 'lotion',
        'deodorant', 'perfume', 'cologne', 'fragrance',
        // Makeup items
        'lipstick', 'lipgloss', 'foundation',
        'mascara', 'eyeliner', 'eyeshadow', 'blush', 'concealer',
        'primer', 'powder', 'compact powder',
        // Skincare items
        'moisturizer', 'sunscreen', 'sunblock', 'toner', 'serum',
        'sheet mask', 'face mask sheet', 'face wash', 'cleanser',
        'scrub', 'exfoliant', 'peel',
        'retinol', 'niacinamide', 'hyaluronic acid', 'vitamin c serum',
        // Specific salon services
        'haircut', 'pa-gupit', 'pagupit',
        'hair color', 'hair dye', 'hair rebond', 'rebond',
        'manicure', 'pedicure', 'mani-pedi', 'manipedi', 'nails',
        'massage', 'facial', 'threading', 'waxing',
        'eyebrow', 'eyebrow threading',
      ],
    },
    {
      key: 'pets',
      name: 'Pets',
      master: 'shopping',
      aliases: [
        'pet', 'pets', 'aso', 'pusa',
        'pet care', 'pet supplies',
        'vet', 'veterinary', 'veterinarian',
        'pet shop', 'pet store',
      ],
      keywords: [
        // Specific paid services / items / brands
        'pet grooming', 'grooming',
        'pet food', 'dog food', 'cat food',
        'dog shampoo', 'cat litter', 'pet shampoo',
        'dog leash', 'pet toys',
        'pedigree', 'purina', 'whiskas', 'royal canin',
        'aquarium', 'fish food',
      ],
    },
  ],
};

// ─── ENTERTAINMENT ─────────────────────────────────────────────────────────

const entertainment: TaxonomyNode = {
  key: 'entertainment',
  name: 'Entertainment',
  master: 'entertainment',
  aliases: ['entertainment', 'leisure', 'pampalipas oras', 'libangan'],
  keywords: [],
  children: [
    {
      key: 'cinema',
      name: 'Cinema',
      master: 'entertainment',
      aliases: [
        'cinema', 'movie', 'movies', 'theater', 'theatre',
        'film', 'showing', 'screening', 'pelikula', 'panonood',
      ],
      keywords: [
        'sm cinema', 'ayala cinemas',
        'imax', 'dolby', '4dx',
        'movie ticket', 'cinema ticket', 'ticket sa sine',
        'movie marathon', 'premiere',
      ],
    },
    {
      key: 'events',
      name: 'Events',
      master: 'entertainment',
      aliases: [
        'concert', 'event', 'events', 'gig', 'live show', 'live',
        'show', 'play', 'musical', 'opera', 'ballet',
      ],
      keywords: [
        'concert ticket', 'event ticket', 'show ticket',
        'festival', 'museum', 'gallery', 'exhibit', 'art exhibit',
        'expo', 'convention', 'comicon', 'comic con',
        'cosplay', 'anime convention', 'anime con',
        'fan meet', 'fan meeting', 'fanmeet',
        'meet and greet', 'meet & greet',
      ],
    },
    {
      key: 'amusement',
      name: 'Amusement',
      master: 'entertainment',
      aliases: [
        'theme park', 'amusement park',
        'arcade', 'karaoke', 'ktv', 'videoke',
      ],
      keywords: [
        'enchanted kingdom', 'ek',
        'dreamplay', 'manila ocean park', 'splash island',
        'star city', 'avilon zoo', 'manila zoo',
        'timezone', "tom's world", 'toms world',
        'bounce', 'trampoline park', 'go kart', 'go-kart',
        'singing booth',
      ],
    },
    {
      key: 'nightlife',
      name: 'Nightlife',
      master: 'entertainment',
      aliases: [
        'nightlife',
        'bar', 'club', 'nightclub', 'lounge', 'pub',
        'beer garden', 'speakeasy', 'cocktail bar',
      ],
      keywords: [
        'billiards', 'pool', 'bowling', 'darts',
        'rave', 'concert hall',
      ],
    },
    {
      key: 'sports',
      name: 'Sports & Fitness',
      master: 'entertainment',
      aliases: ['gym', 'fitness', 'sports', 'sports club'],
      keywords: [
        // Specific paid services / line items
        'court rental', 'sports rental',
        'gym membership', 'fitness first', 'fit',
        // Specific activities (line items, like "I paid for a yoga class")
        'yoga', 'pilates', 'crossfit', 'f45',
        'swim', 'swimming', 'swim class',
        'golf', 'tennis', 'badminton', 'basketball', 'volleyball',
        'football', 'soccer', 'baseball',
        'boxing', 'mma', 'muay thai', 'martial arts',
        'taekwondo', 'karate', 'judo', 'jiu jitsu', 'jiu-jitsu',
        'dance class', 'zumba', 'aerobics', 'spin class',
        'cycling class', 'running club',
      ],
    },
    {
      key: 'outdoor',
      name: 'Outdoor',
      master: 'entertainment',
      aliases: ['outdoor'],
      keywords: [
        'hiking', 'camping', 'trekking', 'mountain climbing',
        'climbing', 'rock climbing',
        'scuba', 'scuba diving', 'snorkeling', 'snorkel',
        'surfing', 'surf', 'beach',
        'island hopping', 'island-hopping',
        'kayaking', 'kayak', 'paddleboarding', 'paddle board',
        'fishing', 'jet ski', 'jet-ski',
        'biking', 'bike rental', 'cycling',
      ],
    },
    {
      key: 'travel',
      name: 'Travel',
      master: 'entertainment',
      aliases: [
        'travel', 'sightseeing',
        'hotel', 'resort', 'hostel', 'lodge', 'inn',
        'accommodation', 'staycation',
        'pension house', 'guest house', 'bed and breakfast', 'b&b',
        'tour',
      ],
      keywords: [
        'airbnb', 'agoda', 'booking.com', 'booking', 'traveloka',
        'klook', 'kkday', 'getyourguide',
        'tour package', 'tour guide',
        'travel insurance', 'visa fee', 'visa application',
        'baggage', 'luggage',
      ],
    },
    {
      key: 'gaming',
      name: 'Gaming',
      master: 'entertainment',
      aliases: [
        'gaming', 'game', 'games',
        'microtransaction', 'iap', 'in-app purchase', 'in app purchase',
        'loot box', 'lootbox',
        'game purchase', 'game store',
      ],
      keywords: [
        // Game stores / wallets
        'steam wallet', 'steam gift card', 'steam top up',
        'steam topup', 'psn store', 'psn wallet', 'ps store',
        'xbox store', 'xbox wallet',
        'nintendo eshop', 'eshop', 'nintendo store',
        'google play credit', 'play store credit',
        // Mobile games + top-ups (specific titles)
        'mobile legends', 'ml', 'mlbb', 'mobile legends diamond',
        'ml diamond', 'mlbb diamond',
        'genshin impact', 'genshin', 'primogems',
        'roblox', 'robux',
        'fortnite', 'v-bucks', 'vbucks', 'v bucks',
        'valorant', 'riot points', 'rp', 'valorant points',
        'league of legends', 'lol', 'lol rp',
        'dota', 'dota 2',
        'csgo', 'cs:go', 'cs go', 'counter strike',
        'pubg', 'bgmi', 'pubg uc', 'uc',
        'call of duty', 'cod', 'cod mobile', 'codm',
        'free fire', 'ff diamond', 'free fire diamond',
        'minecraft', 'minecraft realms',
      ],
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
  entertainment,
];
