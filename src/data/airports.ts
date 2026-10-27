/**
 * Airports used to plan realistic journeys: fly to the airport nearest the place, then continue by road.
 * Coordinates are the airfields (approximate to a few hundred metres — enough for route planning).
 */
export interface Airport { code: string; name: string; lat: number; lon: number }

export const AIRPORTS: Airport[] = [
  // India
  { code: 'DEL', name: 'Delhi', lat: 28.5562, lon: 77.1 }, { code: 'BOM', name: 'Mumbai', lat: 19.0896, lon: 72.8656 },
  { code: 'BLR', name: 'Bengaluru', lat: 13.1986, lon: 77.7066 }, { code: 'MAA', name: 'Chennai', lat: 12.9941, lon: 80.1709 },
  { code: 'CCU', name: 'Kolkata', lat: 22.6547, lon: 88.4467 }, { code: 'HYD', name: 'Hyderabad', lat: 17.2403, lon: 78.4294 },
  { code: 'COK', name: 'Kochi', lat: 10.152, lon: 76.4019 }, { code: 'GOI', name: 'Goa (Dabolim)', lat: 15.3808, lon: 73.8314 },
  { code: 'GOX', name: 'Goa (Mopa)', lat: 15.7442, lon: 73.8606 }, { code: 'JAI', name: 'Jaipur', lat: 26.8242, lon: 75.8122 },
  { code: 'UDR', name: 'Udaipur', lat: 24.6177, lon: 73.8961 }, { code: 'JDH', name: 'Jodhpur', lat: 26.2511, lon: 73.0489 },
  { code: 'JSA', name: 'Jaisalmer', lat: 26.8887, lon: 70.865 }, { code: 'IXJ', name: 'Jammu', lat: 32.6891, lon: 74.8374 },
  { code: 'SXR', name: 'Srinagar', lat: 33.9871, lon: 74.7742 }, { code: 'IXL', name: 'Leh', lat: 34.1359, lon: 77.5465 },
  { code: 'DED', name: 'Dehradun (Jolly Grant)', lat: 30.1897, lon: 78.1803 }, { code: 'PGH', name: 'Pantnagar', lat: 29.0334, lon: 79.4737 },
  { code: 'KUU', name: 'Kullu–Manali (Bhuntar)', lat: 31.8767, lon: 77.1544 }, { code: 'DHM', name: 'Dharamshala (Gaggal)', lat: 32.1651, lon: 76.2634 },
  { code: 'SLV', name: 'Shimla', lat: 31.0818, lon: 77.068 }, { code: 'IXC', name: 'Chandigarh', lat: 30.6735, lon: 76.7885 },
  { code: 'ATQ', name: 'Amritsar', lat: 31.7096, lon: 74.7973 }, { code: 'IXB', name: 'Bagdogra', lat: 26.6812, lon: 88.3286 },
  { code: 'PYG', name: 'Pakyong (Gangtok)', lat: 27.2271, lon: 88.5864 }, { code: 'IXZ', name: 'Port Blair', lat: 11.6412, lon: 92.7297 },
  { code: 'TRV', name: 'Thiruvananthapuram', lat: 8.4821, lon: 76.92 }, { code: 'CCJ', name: 'Kozhikode', lat: 11.1368, lon: 75.9553 },
  { code: 'CNN', name: 'Kannur', lat: 11.9186, lon: 75.5472 }, { code: 'IXE', name: 'Mangaluru', lat: 12.9613, lon: 74.8901 },
  { code: 'MYQ', name: 'Mysuru', lat: 12.23, lon: 76.6558 }, { code: 'CJB', name: 'Coimbatore', lat: 11.03, lon: 77.0434 },
  { code: 'IXM', name: 'Madurai', lat: 9.8345, lon: 78.0934 }, { code: 'TRZ', name: 'Tiruchirappalli', lat: 10.7654, lon: 78.7097 },
  { code: 'TIR', name: 'Tirupati', lat: 13.6325, lon: 79.5433 }, { code: 'VNS', name: 'Varanasi', lat: 25.4524, lon: 82.8593 },
  { code: 'AGR', name: 'Agra', lat: 27.1558, lon: 77.9609 }, { code: 'LKO', name: 'Lucknow', lat: 26.7606, lon: 80.8893 },
  { code: 'PAT', name: 'Patna', lat: 25.5913, lon: 85.088 }, { code: 'GAY', name: 'Gaya', lat: 24.7443, lon: 84.9512 },
  { code: 'IXR', name: 'Ranchi', lat: 23.3143, lon: 85.3217 }, { code: 'BBI', name: 'Bhubaneswar', lat: 20.2444, lon: 85.8178 },
  { code: 'GAU', name: 'Guwahati', lat: 26.1061, lon: 91.5859 }, { code: 'IMF', name: 'Imphal', lat: 24.76, lon: 93.8967 },
  { code: 'AMD', name: 'Ahmedabad', lat: 23.0772, lon: 72.6347 }, { code: 'PNQ', name: 'Pune', lat: 18.5821, lon: 73.9197 },
  { code: 'NAG', name: 'Nagpur', lat: 21.0922, lon: 79.0472 }, { code: 'IXU', name: 'Aurangabad', lat: 19.8627, lon: 75.3981 },
  { code: 'HBX', name: 'Hubballi', lat: 15.3617, lon: 75.0849 }, { code: 'IDR', name: 'Indore', lat: 22.7218, lon: 75.8011 },
  { code: 'BHO', name: 'Bhopal', lat: 23.2875, lon: 77.3374 }, { code: 'VTZ', name: 'Visakhapatnam', lat: 17.7212, lon: 83.2245 },
  { code: 'IXA', name: 'Agartala', lat: 23.887, lon: 91.2404 }, { code: 'STV', name: 'Surat', lat: 21.1141, lon: 72.7418 },
  // Abroad
  { code: 'DXB', name: 'Dubai', lat: 25.2532, lon: 55.3657 }, { code: 'AUH', name: 'Abu Dhabi', lat: 24.433, lon: 54.6511 },
  { code: 'DOH', name: 'Doha', lat: 25.2731, lon: 51.6081 }, { code: 'SIN', name: 'Singapore', lat: 1.3644, lon: 103.9915 },
  { code: 'BKK', name: 'Bangkok', lat: 13.69, lon: 100.7501 }, { code: 'HKT', name: 'Phuket', lat: 8.1132, lon: 98.3169 },
  { code: 'CNX', name: 'Chiang Mai', lat: 18.7668, lon: 98.9626 }, { code: 'DPS', name: 'Bali (Denpasar)', lat: -8.7482, lon: 115.167 },
  { code: 'MLE', name: 'Malé', lat: 4.1918, lon: 73.5291 }, { code: 'CMB', name: 'Colombo', lat: 7.1808, lon: 79.8841 },
  { code: 'KTM', name: 'Kathmandu', lat: 27.6966, lon: 85.3591 }, { code: 'KUL', name: 'Kuala Lumpur', lat: 2.7456, lon: 101.7099 },
  { code: 'HKG', name: 'Hong Kong', lat: 22.308, lon: 113.9185 }, { code: 'HND', name: 'Tokyo (Haneda)', lat: 35.5494, lon: 139.7798 },
  { code: 'KIX', name: 'Osaka (Kansai)', lat: 34.4347, lon: 135.244 }, { code: 'ICN', name: 'Seoul (Incheon)', lat: 37.4602, lon: 126.4407 },
  { code: 'PEK', name: 'Beijing', lat: 40.0799, lon: 116.6031 }, { code: 'PVG', name: 'Shanghai', lat: 31.1443, lon: 121.8083 },
  { code: 'SYD', name: 'Sydney', lat: -33.9399, lon: 151.1753 }, { code: 'MEL', name: 'Melbourne', lat: -37.669, lon: 144.841 },
  { code: 'LHR', name: 'London (Heathrow)', lat: 51.47, lon: -0.4543 }, { code: 'CDG', name: 'Paris (CDG)', lat: 49.0097, lon: 2.5479 },
  { code: 'FCO', name: 'Rome', lat: 41.8003, lon: 12.2389 }, { code: 'ZRH', name: 'Zurich', lat: 47.4582, lon: 8.5555 },
  { code: 'GVA', name: 'Geneva', lat: 46.2381, lon: 6.109 }, { code: 'MXP', name: 'Milan', lat: 45.6306, lon: 8.7281 },
  { code: 'AMS', name: 'Amsterdam', lat: 52.3105, lon: 4.7683 }, { code: 'FRA', name: 'Frankfurt', lat: 50.0379, lon: 8.5622 },
  { code: 'BCN', name: 'Barcelona', lat: 41.2974, lon: 2.0833 }, { code: 'MAD', name: 'Madrid', lat: 40.4983, lon: -3.5676 },
  { code: 'VIE', name: 'Vienna', lat: 48.1103, lon: 16.5697 }, { code: 'ATH', name: 'Athens', lat: 37.9364, lon: 23.9445 },
  { code: 'IST', name: 'Istanbul', lat: 41.2753, lon: 28.7519 }, { code: 'CAI', name: 'Cairo', lat: 30.1219, lon: 31.4056 },
  { code: 'JNB', name: 'Johannesburg', lat: -26.1367, lon: 28.2411 }, { code: 'CPT', name: 'Cape Town', lat: -33.9715, lon: 18.6021 },
  { code: 'JFK', name: 'New York (JFK)', lat: 40.6413, lon: -73.7781 }, { code: 'LAX', name: 'Los Angeles', lat: 33.9416, lon: -118.4085 },
  { code: 'SFO', name: 'San Francisco', lat: 37.6213, lon: -122.379 }, { code: 'YYZ', name: 'Toronto', lat: 43.6777, lon: -79.6248 },
];

const R = 6371;
const km = (a: [number, number], b: [number, number]) => {
  const dLat = ((b[0] - a[0]) * Math.PI) / 180, dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/** The airport nearest a point, if one is within `maxKm`. */
export function nearestAirport(p: [number, number], maxKm: number): (Airport & { km: number }) | null {
  let best: (Airport & { km: number }) | null = null;
  for (const a of AIRPORTS) { const d = km(p, [a.lat, a.lon]); if (d <= maxKm && (!best || d < best.km)) best = { ...a, km: d }; }
  return best;
}
