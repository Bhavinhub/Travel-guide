/**
 * Booking & discovery providers. Travel Guide has no booking integration: these are
 * outbound links to official airline / operator sites and to search platforms that show
 * live prices and availability. Lists of airlines are "to compare", not claims that an
 * airline flies a particular route.
 */

export interface Provider { name: string; url: string; note?: string }

export const IATA_DEPARTURE: Record<string, string> = {
  bengaluru: 'BLR', mumbai: 'BOM', delhi: 'DEL', chennai: 'MAA', hyderabad: 'HYD', kolkata: 'CCU', pune: 'PNQ',
  ahmedabad: 'AMD', kochi: 'COK', jaipur: 'JAI', dubai: 'DXB', singapore: 'SIN', london: 'LON', 'new-york': 'NYC',
};

/** Arrival airport (or metropolitan code) per destination with its own airport. */
export const IATA_DEST: Record<string, string> = {
  bengaluru: 'BLR', mysuru: 'MYQ', goa: 'GOI', mumbai: 'BOM', jaipur: 'JAI', udaipur: 'UDR', delhi: 'DEL', agra: 'AGR',
  leh: 'IXL', srinagar: 'SXR', varanasi: 'VNS', 'port-blair': 'IXZ', bangkok: 'BKK', phuket: 'HKT', 'chiang-mai': 'CNX',
  singapore: 'SIN', bali: 'DPS', dubai: 'DXB', male: 'MLE', tokyo: 'TYO', paris: 'PAR', rome: 'ROM', london: 'LON',
  'new-york': 'NYC', 'los-angeles': 'LAX',
};

export const DOMESTIC_AIRLINES: Provider[] = [
  { name: 'IndiGo', url: 'https://www.goindigo.in' },
  { name: 'Air India', url: 'https://www.airindia.com' },
  { name: 'Akasa Air', url: 'https://www.akasaair.com' },
  { name: 'Air India Express', url: 'https://www.airindiaexpress.com' },
  { name: 'SpiceJet', url: 'https://www.spicejet.com' },
];

export const INTL_AIRLINES: Record<string, Provider[]> = {
  Thailand: [{ name: 'Thai Airways', url: 'https://www.thaiairways.com' }],
  Singapore: [{ name: 'Singapore Airlines', url: 'https://www.singaporeair.com' }, { name: 'Scoot', url: 'https://www.flyscoot.com' }],
  Indonesia: [{ name: 'Garuda Indonesia', url: 'https://www.garuda-indonesia.com' }],
  'United Arab Emirates': [{ name: 'Emirates', url: 'https://www.emirates.com' }, { name: 'flydubai', url: 'https://www.flydubai.com' }],
  Japan: [{ name: 'Japan Airlines', url: 'https://www.jal.com' }, { name: 'ANA', url: 'https://www.ana.co.jp/en/' }],
  France: [{ name: 'Air France', url: 'https://www.airfrance.com' }],
  Italy: [{ name: 'ITA Airways', url: 'https://www.ita-airways.com' }],
  'United Kingdom': [{ name: 'British Airways', url: 'https://www.britishairways.com' }, { name: 'Virgin Atlantic', url: 'https://www.virginatlantic.com' }],
  Switzerland: [{ name: 'SWISS', url: 'https://www.swiss.com' }],
  'United States': [{ name: 'United Airlines', url: 'https://www.united.com' }, { name: 'American Airlines', url: 'https://www.aa.com' }],
  Maldives: [],
};
export const INDIAN_INTL: Provider[] = [
  { name: 'Air India', url: 'https://www.airindia.com' },
  { name: 'IndiGo', url: 'https://www.goindigo.in' },
];

export const INDIA_GROUND = {
  cabs: [
    { name: 'Savaari (outstation cabs)', url: 'https://www.savaari.com' },
    { name: 'MakeMyTrip Cabs', url: 'https://www.makemytrip.com/cabs/' },
    { name: 'Ola', url: 'https://www.olacabs.com' },
    { name: 'Uber', url: 'https://www.uber.com/in/en/' },
  ],
  selfDrive: [{ name: 'Zoomcar (self-drive)', url: 'https://www.zoomcar.com' }],
  bikes: [{ name: 'Royal Brothers (bike rental)', url: 'https://www.royalbrothers.com' }],
  trains: [{ name: 'IRCTC (Indian Railways)', url: 'https://www.irctc.co.in' }],
  buses: [{ name: 'redBus', url: 'https://www.redbus.in' }, { name: 'AbhiBus', url: 'https://www.abhibus.com' }],
  heli: [
    { name: 'Pawan Hans (government helicopter operator)', url: 'https://www.pawanhans.co.in' },
    { name: 'IRCTC HeliYatra (Uttarakhand pilgrim routes)', url: 'https://www.heliyatra.irctc.co.in', note: 'Only for specific Uttarakhand routes' },
  ],
};

/** Ride-hailing / local transport by country (well-established operators). */
export const LOCAL_RIDES: Record<string, Provider[]> = {
  India: [{ name: 'Uber', url: 'https://www.uber.com/in/en/' }, { name: 'Ola', url: 'https://www.olacabs.com' }, { name: 'Rapido', url: 'https://www.rapido.bike' }],
  Thailand: [{ name: 'Grab', url: 'https://www.grab.com/th/en/' }, { name: 'Bolt', url: 'https://bolt.eu' }],
  Singapore: [{ name: 'Grab', url: 'https://www.grab.com/sg/' }],
  Indonesia: [{ name: 'Grab', url: 'https://www.grab.com/id/en/' }, { name: 'Gojek', url: 'https://www.gojek.com' }],
  'United Arab Emirates': [{ name: 'Careem', url: 'https://www.careem.com' }, { name: 'Uber', url: 'https://www.uber.com' }],
  'United Kingdom': [{ name: 'Uber', url: 'https://www.uber.com' }, { name: 'Bolt', url: 'https://bolt.eu' }],
  France: [{ name: 'Uber', url: 'https://www.uber.com' }, { name: 'Bolt', url: 'https://bolt.eu' }],
  Italy: [{ name: 'Uber', url: 'https://www.uber.com' }],
  'United States': [{ name: 'Uber', url: 'https://www.uber.com' }, { name: 'Lyft', url: 'https://www.lyft.com' }],
  Switzerland: [{ name: 'SBB (Swiss trains)', url: 'https://www.sbb.ch/en' }],
  Japan: [{ name: 'Japan rail & metro — Japan Guide', url: 'https://www.japan-guide.com/e/e2018.html' }],
  Maldives: [],
};
export const CAR_RENTAL_INTL: Provider[] = [{ name: 'Rentalcars.com', url: 'https://www.rentalcars.com' }];

/** Well-known eateries (long-established; verify current hours before visiting). */
export const ICONIC_EATS: Record<string, { name: string; style: 'street' | 'casual' | 'fine'; what: string }[]> = {
  bengaluru: [
    { name: 'Mavalli Tiffin Rooms (MTR), Lalbagh Road', style: 'casual', what: 'Classic South Indian breakfast since 1924' },
    { name: 'Vidyarthi Bhavan, Basavanagudi', style: 'casual', what: 'Crisp masala dosa' },
    { name: 'CTR (Shri Sagar), Malleshwaram', style: 'street', what: 'Benne masala dosa' },
  ],
  mysuru: [
    { name: 'Hotel Mylari, Mysuru', style: 'street', what: 'Soft Mylari dosa' },
    { name: 'Guru Sweet Mart, Mysuru', style: 'street', what: 'Mysore pak' },
  ],
  mumbai: [
    { name: 'Britannia & Co., Ballard Estate', style: 'casual', what: 'Parsi berry pulao' },
    { name: 'Bademiya, Colaba', style: 'street', what: 'Late-night kebabs' },
    { name: 'Swati Snacks, Tardeo', style: 'casual', what: 'Gujarati snacks' },
  ],
  delhi: [
    { name: "Karim's, Jama Masjid", style: 'casual', what: 'Mughlai mutton dishes' },
    { name: 'Paranthe Wali Gali, Chandni Chowk', style: 'street', what: 'Stuffed parathas' },
    { name: 'Indian Accent, New Delhi', style: 'fine', what: 'Modern Indian tasting menu' },
    { name: 'Bukhara, ITC Maurya', style: 'fine', what: 'Tandoor classics' },
  ],
  jaipur: [
    { name: 'Rawat Mishtan Bhandar, Jaipur', style: 'street', what: 'Pyaaz kachori' },
    { name: 'Laxmi Misthan Bhandar (LMB), Johari Bazaar', style: 'casual', what: 'Rajasthani thali & sweets' },
    { name: 'Suvarna Mahal, Rambagh Palace', style: 'fine', what: 'Royal Indian dining' },
  ],
  udaipur: [
    { name: 'Ambrai Restaurant, Udaipur', style: 'fine', what: 'Lakeside dinner facing City Palace' },
    { name: 'Natraj Dining Hall, Udaipur', style: 'casual', what: 'Unlimited Rajasthani thali' },
  ],
  agra: [
    { name: 'Panchhi Petha, Agra', style: 'street', what: 'Agra petha sweets' },
    { name: 'Esphahan, The Oberoi Amarvilas', style: 'fine', what: 'Mughlai fine dining' },
  ],
  varanasi: [
    { name: 'Kashi Chat Bhandar, Varanasi', style: 'street', what: 'Tamatar chaat' },
    { name: 'Blue Lassi Shop, Varanasi', style: 'street', what: 'Fruit lassi' },
  ],
  nainital: [{ name: 'Sakley’s Restaurant & Pastry Shop, Mall Road', style: 'casual', what: 'Bakery & continental' }],
  rishikesh: [
    { name: 'Chotiwala, Rishikesh', style: 'casual', what: 'Vegetarian thalis by the river' },
    { name: 'Little Buddha Cafe, Rishikesh', style: 'casual', what: 'Café with Ganga views' },
  ],
  goa: [
    { name: "Britto's, Baga", style: 'casual', what: 'Beach-side Goan seafood' },
    { name: 'Ritz Classic, Panaji', style: 'casual', what: 'Fish thali' },
    { name: 'Gunpowder, Assagao', style: 'casual', what: 'Peninsular Indian cooking' },
  ],
  pondicherry: [
    { name: 'Villa Shanti, White Town', style: 'fine', what: 'Franco-Tamil dining' },
    { name: 'Baker Street, Pondicherry', style: 'casual', what: 'French bakery' },
  ],
  manali: [{ name: "Johnson's Cafe, Manali", style: 'casual', what: 'Trout & garden seating' }],
  leh: [{ name: 'Tibetan Kitchen, Leh', style: 'casual', what: 'Momos & thukpa' }],
  darjeeling: [{ name: "Keventer's, Darjeeling", style: 'casual', what: 'Heritage breakfast terrace' }, { name: "Glenary's, Darjeeling", style: 'casual', what: 'Bakery & tea room' }],
  srinagar: [{ name: "Ahdoos, Srinagar", style: 'casual', what: 'Kashmiri wazwan' }, { name: 'Krishna Vaishno Dhaba, Srinagar', style: 'street', what: 'Vegetarian dhaba' }],
  bangkok: [{ name: 'Raan Jay Fai, Bangkok', style: 'street', what: 'Crab omelette (expect queues)' }, { name: 'Thipsamai, Bangkok', style: 'street', what: 'Pad thai' }],
  singapore: [{ name: 'Maxwell Food Centre, Singapore', style: 'street', what: 'Hawker classics' }, { name: 'Lau Pa Sat, Singapore', style: 'street', what: 'Satay street at night' }],
  tokyo: [{ name: 'Tsukiji Outer Market, Tokyo', style: 'street', what: 'Seafood breakfast' }],
  kyoto: [{ name: 'Nishiki Market, Kyoto', style: 'street', what: 'Kyoto snacks' }, { name: 'Pontocho Alley, Kyoto', style: 'fine', what: 'Riverside dining lanes' }],
  paris: [{ name: "L'As du Fallafel, Le Marais", style: 'street', what: 'Falafel' }, { name: 'Breizh Café, Le Marais', style: 'casual', what: 'Breton crêpes' }],
  rome: [{ name: 'Roscioli Salumeria con Cucina, Rome', style: 'fine', what: 'Carbonara & cured meats' }, { name: 'Da Enzo al 29, Trastevere', style: 'casual', what: 'Roman trattoria' }],
  london: [{ name: 'Dishoom (several branches), London', style: 'casual', what: 'Bombay café food' }, { name: 'Borough Market, London', style: 'street', what: 'Food stalls' }],
  'new-york': [{ name: "Katz's Delicatessen, New York", style: 'casual', what: 'Pastrami on rye' }, { name: "Joe's Pizza, Greenwich Village", style: 'street', what: 'New York slice' }],
  'los-angeles': [{ name: 'Grand Central Market, Los Angeles', style: 'street', what: 'Food hall' }, { name: "Langer's Delicatessen, Los Angeles", style: 'casual', what: 'Pastrami sandwich' }],
  dubai: [{ name: 'Ravi Restaurant, Satwa', style: 'casual', what: 'Pakistani curries' }, { name: 'Al Ustad Special Kabab, Dubai', style: 'casual', what: 'Persian kebabs' }],
  bali: [{ name: 'Warung Babi Guling Ibu Oka, Ubud', style: 'street', what: 'Suckling pig' }],
  'chiang-mai': [{ name: 'Khao Soi Khun Yai, Chiang Mai', style: 'street', what: 'Khao soi (lunch only)' }],
};
