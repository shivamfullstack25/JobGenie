// Global locations database with currency mapping
export interface LocationData {
  name: string;
  country: string;
  currency: string;
  currencySymbol: string;
  region: string;
  coordinates?: [number, number];
}

export const globalLocations: LocationData[] = [
  // United States
  { name: "New York", country: "United States", currency: "USD", currencySymbol: "$", region: "North America", coordinates: [40.7128, -74.0060] },
  { name: "San Francisco", country: "United States", currency: "USD", currencySymbol: "$", region: "North America", coordinates: [37.7749, -122.4194] },
  { name: "Los Angeles", country: "United States", currency: "USD", currencySymbol: "$", region: "North America", coordinates: [34.0522, -118.2437] },
  { name: "Chicago", country: "United States", currency: "USD", currencySymbol: "$", region: "North America", coordinates: [41.8781, -87.6298] },
  { name: "Boston", country: "United States", currency: "USD", currencySymbol: "$", region: "North America", coordinates: [42.3601, -71.0589] },
  { name: "Seattle", country: "United States", currency: "USD", currencySymbol: "$", region: "North America", coordinates: [47.6062, -122.3321] },
  { name: "Austin", country: "United States", currency: "USD", currencySymbol: "$", region: "North America", coordinates: [30.2672, -97.7431] },
  { name: "Denver", country: "United States", currency: "USD", currencySymbol: "$", region: "North America", coordinates: [39.7392, -104.9903] },
  { name: "Miami", country: "United States", currency: "USD", currencySymbol: "$", region: "North America", coordinates: [25.7617, -80.1918] },
  { name: "Washington DC", country: "United States", currency: "USD", currencySymbol: "$", region: "North America", coordinates: [38.9072, -77.0369] },

  // Canada
  { name: "Toronto", country: "Canada", currency: "CAD", currencySymbol: "C$", region: "North America", coordinates: [43.6532, -79.3832] },
  { name: "Vancouver", country: "Canada", currency: "CAD", currencySymbol: "C$", region: "North America", coordinates: [49.2827, -123.1207] },
  { name: "Montreal", country: "Canada", currency: "CAD", currencySymbol: "C$", region: "North America", coordinates: [45.5017, -73.5673] },
  { name: "Calgary", country: "Canada", currency: "CAD", currencySymbol: "C$", region: "North America", coordinates: [51.0447, -114.0719] },
  { name: "Ottawa", country: "Canada", currency: "CAD", currencySymbol: "C$", region: "North America", coordinates: [45.4215, -75.6972] },

  // United Kingdom
  { name: "London", country: "United Kingdom", currency: "GBP", currencySymbol: "£", region: "Europe", coordinates: [51.5074, -0.1278] },
  { name: "Manchester", country: "United Kingdom", currency: "GBP", currencySymbol: "£", region: "Europe", coordinates: [53.4808, -2.2426] },
  { name: "Edinburgh", country: "United Kingdom", currency: "GBP", currencySymbol: "£", region: "Europe", coordinates: [55.9533, -3.1883] },
  { name: "Birmingham", country: "United Kingdom", currency: "GBP", currencySymbol: "£", region: "Europe", coordinates: [52.4862, -1.8904] },
  { name: "Bristol", country: "United Kingdom", currency: "GBP", currencySymbol: "£", region: "Europe", coordinates: [51.4545, -2.5879] },

  // Germany
  { name: "Berlin", country: "Germany", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [52.5200, 13.4050] },
  { name: "Munich", country: "Germany", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [48.1351, 11.5820] },
  { name: "Hamburg", country: "Germany", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [53.5511, 9.9937] },
  { name: "Frankfurt", country: "Germany", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [50.1109, 8.6821] },
  { name: "Cologne", country: "Germany", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [50.9375, 6.9603] },

  // France
  { name: "Paris", country: "France", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [48.8566, 2.3522] },
  { name: "Lyon", country: "France", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [45.7640, 4.8357] },
  { name: "Marseille", country: "France", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [43.2965, 5.3698] },
  { name: "Nice", country: "France", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [43.7102, 7.2620] },
  { name: "Toulouse", country: "France", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [43.6047, 1.4442] },

  // Netherlands
  { name: "Amsterdam", country: "Netherlands", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [52.3676, 4.9041] },
  { name: "Rotterdam", country: "Netherlands", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [51.9244, 4.4777] },
  { name: "The Hague", country: "Netherlands", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [52.0705, 4.3007] },

  // Switzerland
  { name: "Zurich", country: "Switzerland", currency: "CHF", currencySymbol: "Fr", region: "Europe", coordinates: [47.3769, 8.5417] },
  { name: "Geneva", country: "Switzerland", currency: "CHF", currencySymbol: "Fr", region: "Europe", coordinates: [46.2044, 6.1432] },
  { name: "Basel", country: "Switzerland", currency: "CHF", currencySymbol: "Fr", region: "Europe", coordinates: [47.5596, 7.5886] },

  // India
  { name: "Bengaluru", country: "India", currency: "INR", currencySymbol: "₹", region: "Asia", coordinates: [12.9716, 77.5946] },
  { name: "Mumbai", country: "India", currency: "INR", currencySymbol: "₹", region: "Asia", coordinates: [19.0760, 72.8777] },
  { name: "Delhi", country: "India", currency: "INR", currencySymbol: "₹", region: "Asia", coordinates: [28.7041, 77.1025] },
  { name: "Hyderabad", country: "India", currency: "INR", currencySymbol: "₹", region: "Asia", coordinates: [17.3850, 78.4867] },
  { name: "Chennai", country: "India", currency: "INR", currencySymbol: "₹", region: "Asia", coordinates: [13.0827, 80.2707] },
  { name: "Kolkata", country: "India", currency: "INR", currencySymbol: "₹", region: "Asia", coordinates: [22.5726, 88.3639] },
  { name: "Pune", country: "India", currency: "INR", currencySymbol: "₹", region: "Asia", coordinates: [18.5204, 73.8567] },
  { name: "Ahmedabad", country: "India", currency: "INR", currencySymbol: "₹", region: "Asia", coordinates: [23.0225, 72.5714] },
  { name: "Gurugram", country: "India", currency: "INR", currencySymbol: "₹", region: "Asia", coordinates: [28.4595, 77.0266] },
  { name: "Noida", country: "India", currency: "INR", currencySymbol: "₹", region: "Asia", coordinates: [28.5355, 77.3910] },
  { name: "Kochi", country: "India", currency: "INR", currencySymbol: "₹", region: "Asia", coordinates: [9.9312, 76.2673] },
  { name: "Indore", country: "India", currency: "INR", currencySymbol: "₹", region: "Asia", coordinates: [22.7196, 75.8577] },

  // China
  { name: "Beijing", country: "China", currency: "CNY", currencySymbol: "¥", region: "Asia", coordinates: [39.9042, 116.4074] },
  { name: "Shanghai", country: "China", currency: "CNY", currencySymbol: "¥", region: "Asia", coordinates: [31.2304, 121.4737] },
  { name: "Shenzhen", country: "China", currency: "CNY", currencySymbol: "¥", region: "Asia", coordinates: [22.5431, 114.0579] },
  { name: "Guangzhou", country: "China", currency: "CNY", currencySymbol: "¥", region: "Asia", coordinates: [23.1291, 113.2644] },
  { name: "Hangzhou", country: "China", currency: "CNY", currencySymbol: "¥", region: "Asia", coordinates: [30.2741, 120.1551] },

  // Japan
  { name: "Tokyo", country: "Japan", currency: "JPY", currencySymbol: "¥", region: "Asia", coordinates: [35.6762, 139.6503] },
  { name: "Osaka", country: "Japan", currency: "JPY", currencySymbol: "¥", region: "Asia", coordinates: [34.6937, 135.5023] },
  { name: "Kyoto", country: "Japan", currency: "JPY", currencySymbol: "¥", region: "Asia", coordinates: [35.0116, 135.7681] },
  { name: "Yokohama", country: "Japan", currency: "JPY", currencySymbol: "¥", region: "Asia", coordinates: [35.4438, 139.6380] },

  // Singapore
  { name: "Singapore", country: "Singapore", currency: "SGD", currencySymbol: "S$", region: "Asia", coordinates: [1.3521, 103.8198] },

  // Australia
  { name: "Sydney", country: "Australia", currency: "AUD", currencySymbol: "A$", region: "Oceania", coordinates: [-33.8688, 151.2093] },
  { name: "Melbourne", country: "Australia", currency: "AUD", currencySymbol: "A$", region: "Oceania", coordinates: [-37.8136, 144.9631] },
  { name: "Brisbane", country: "Australia", currency: "AUD", currencySymbol: "A$", region: "Oceania", coordinates: [-27.4698, 153.0251] },
  { name: "Perth", country: "Australia", currency: "AUD", currencySymbol: "A$", region: "Oceania", coordinates: [-31.9505, 115.8605] },

  // South Korea
  { name: "Seoul", country: "South Korea", currency: "KRW", currencySymbol: "₩", region: "Asia", coordinates: [37.5665, 126.9780] },
  { name: "Busan", country: "South Korea", currency: "KRW", currencySymbol: "₩", region: "Asia", coordinates: [35.1796, 129.0756] },

  // Brazil
  { name: "São Paulo", country: "Brazil", currency: "BRL", currencySymbol: "R$", region: "South America", coordinates: [-23.5505, -46.6333] },
  { name: "Rio de Janeiro", country: "Brazil", currency: "BRL", currencySymbol: "R$", region: "South America", coordinates: [-22.9068, -43.1729] },

  // Mexico
  { name: "Mexico City", country: "Mexico", currency: "MXN", currencySymbol: "MX$", region: "North America", coordinates: [19.4326, -99.1332] },
  { name: "Guadalajara", country: "Mexico", currency: "MXN", currencySymbol: "MX$", region: "North America", coordinates: [20.6597, -103.3496] },

  // Italy
  { name: "Rome", country: "Italy", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [41.9028, 12.4964] },
  { name: "Milan", country: "Italy", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [45.4642, 9.1900] },

  // Spain
  { name: "Madrid", country: "Spain", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [40.4168, -3.7038] },
  { name: "Barcelona", country: "Spain", currency: "EUR", currencySymbol: "€", region: "Europe", coordinates: [41.3851, 2.1734] },

  // Sweden
  { name: "Stockholm", country: "Sweden", currency: "SEK", currencySymbol: "kr", region: "Europe", coordinates: [59.3293, 18.0686] },

  // Norway
  { name: "Oslo", country: "Norway", currency: "NOK", currencySymbol: "kr", region: "Europe", coordinates: [59.9139, 10.7522] },

  // Denmark
  { name: "Copenhagen", country: "Denmark", currency: "DKK", currencySymbol: "kr", region: "Europe", coordinates: [55.6761, 12.5683] },

  // Israel
  { name: "Tel Aviv", country: "Israel", currency: "ILS", currencySymbol: "₪", region: "Middle East", coordinates: [32.0853, 34.7818] },

  // UAE
  { name: "Dubai", country: "UAE", currency: "AED", currencySymbol: "د.إ", region: "Middle East", coordinates: [25.2048, 55.2708] },
  { name: "Abu Dhabi", country: "UAE", currency: "AED", currencySymbol: "د.إ", region: "Middle East", coordinates: [24.4539, 54.3773] },

  // South Africa
  { name: "Cape Town", country: "South Africa", currency: "ZAR", currencySymbol: "R", region: "Africa", coordinates: [-33.9249, 18.4241] },
  { name: "Johannesburg", country: "South Africa", currency: "ZAR", currencySymbol: "R", region: "Africa", coordinates: [-26.2041, 28.0473] },

  // Remote work option
  { name: "Remote", country: "Global", currency: "USD", currencySymbol: "$", region: "Global", coordinates: [0, 0] },
];

export const getCurrencyByLocation = (locationName: string): { currency: string; symbol: string } => {
  const location = globalLocations.find(loc => 
    loc.name.toLowerCase() === locationName.toLowerCase()
  );
  
  return location 
    ? { currency: location.currency, symbol: location.currencySymbol }
    : { currency: 'USD', symbol: '$' }; // Default fallback
};

export const searchLocations = (query: string): LocationData[] => {
  if (!query.trim()) return globalLocations.slice(0, 10);
  
  const queryLower = query.toLowerCase();
  
  return globalLocations.filter(location =>
    location.name.toLowerCase().includes(queryLower) ||
    location.country.toLowerCase().includes(queryLower) ||
    location.region.toLowerCase().includes(queryLower)
  ).slice(0, 20);
};

export const getPopularLocations = (): LocationData[] => {
  // Return most popular tech hubs
  const popularCities = [
    "San Francisco", "New York", "London", "Bengaluru", "Berlin", 
    "Amsterdam", "Toronto", "Sydney", "Singapore", "Tel Aviv", "Remote"
  ];
  
  return globalLocations.filter(loc => 
    popularCities.includes(loc.name)
  );
};