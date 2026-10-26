import { getDeparture } from '../data/catalog';
import { IATA_DEPARTURE, IATA_DEST } from '../data/booking';
import type { Destination } from '../data/types';
import { addDaysISO } from './time';
import type { TripConfig } from './trip';

const q = encodeURIComponent;

/** Arrival airport code: own airport, otherwise the gateway hub's code. */
export function arrivalIATA(d: Destination) {
  return IATA_DEST[d.id] ?? d.gateway?.name.match(/\(([A-Z]{3})\)/)?.[1];
}

export function flightLinks(c: TripConfig, d: Destination) {
  const from = IATA_DEPARTURE[c.departureId];
  const to = arrivalIATA(d);
  const back = addDaysISO(c.startDate, Math.max(0, c.days - 1));
  const pax = c.adults + c.children;
  const yymmdd = (iso: string) => iso.slice(2).replace(/-/g, '');
  const cabin = c.travelClass === 'business' ? 'business' : c.travelClass === 'premium' ? 'premium economy' : 'economy';
  return {
    from, to,
    google: `https://www.google.com/travel/flights?q=${q(`Flights from ${from ?? getDeparture(c.departureId).name} to ${to ?? d.name} on ${c.startDate} returning ${back} ${cabin} ${pax} passengers`)}`,
    skyscanner: from && to ? `https://www.skyscanner.co.in/transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/${yymmdd(c.startDate)}/${yymmdd(back)}/?adultsv2=${c.adults}&cabinclass=${c.travelClass === 'business' ? 'business' : c.travelClass === 'premium' ? 'premiumeconomy' : 'economy'}` : undefined,
  };
}

export function hotelLinks(c: TripConfig, d: Destination, tier: 'budget' | 'comfortable' | 'premium' | 'luxury') {
  const nights = Math.max(1, c.days - 1);
  const out = addDaysISO(c.startDate, nights);
  const place = d.kind === 'atoll' || d.kind === 'island' ? `${d.name}, ${d.country}` : `${d.name}, ${d.country}`;
  // Booking.com: sorted by price; "budget" keeps a review-score floor of 8+ for quality.
  const filters = { budget: 'review_score=80', comfortable: 'class=3;review_score=80', premium: 'class=4', luxury: 'class=5' }[tier];
  return {
    booking: `https://www.booking.com/searchresults.html?ss=${q(place)}&checkin=${c.startDate}&checkout=${out}&group_adults=${c.adults}&group_children=${c.children}&no_rooms=${c.rooms}&order=price&nflt=${q(filters)}`,
    google: `https://www.google.com/travel/search?q=${q(`${tier === 'luxury' ? '5 star' : tier === 'premium' ? '4 star' : tier === 'comfortable' ? '3 star' : 'best value'} hotels in ${place}`)}`,
    mmt: d.country === 'India' ? 'https://www.makemytrip.com/hotels/' : undefined,
  };
}

export const mapsSearch = (what: string) => `https://www.google.com/maps/search/?api=1&query=${q(what)}`;
export const mapsDirections = (from: string, to: string, mode: 'driving' | 'transit' = 'driving') =>
  `https://www.google.com/maps/dir/?api=1&origin=${q(from)}&destination=${q(to)}&travelmode=${mode}`;
export const youtube = (d: Destination) => `https://www.youtube.com/results?search_query=${q(`${d.name} travel vlog`)}`;
export const instagramTag = (d: Destination) => `https://www.instagram.com/explore/tags/${q(d.name.split(' (')[0].replace(/[^A-Za-z]/g, '').toLowerCase())}/`;
export const tripadvisorEats = (d: Destination) => `https://www.tripadvisor.com/Search?q=${q(`restaurants ${d.name}`)}`;
