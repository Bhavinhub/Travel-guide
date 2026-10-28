/**
 * Facts for everything you can tap in the space view (CosmicZoom). `wiki` is the English Wikipedia page,
 * which supplies the photo and a short description when online; the facts here work offline too.
 */
export interface CosmicInfo { kind: string; facts: [string, string][]; wiki: string }

export const COSMOS: Record<string, CosmicInfo> = {
  Sun: { kind: 'Star (G-type main sequence)', wiki: 'Sun', facts: [['Diameter', '1,392,700 km (109 Earths)'], ['Surface', '5,500 °C'], ['Age', '4.6 billion years'], ['Light to Earth', '8 min 20 s']] },
  Mercury: { kind: 'Planet', wiki: 'Mercury_(planet)', facts: [['Diameter', '4,879 km'], ['From the Sun', '0.39 AU (58 million km)'], ['Year', '88 days'], ['Moons', '0']] },
  Venus: { kind: 'Planet', wiki: 'Venus', facts: [['Diameter', '12,104 km'], ['From the Sun', '0.72 AU (108 million km)'], ['Year', '225 days'], ['Surface', '465 °C — the hottest planet']] },
  Earth: { kind: 'Planet — home', wiki: 'Earth', facts: [['Diameter', '12,742 km'], ['From the Sun', '1 AU (150 million km)'], ['Year', '365.25 days'], ['Moons', '1']] },
  Moon: { kind: "Earth's natural satellite", wiki: 'Moon', facts: [['Diameter', '3,474 km'], ['From Earth', '384,400 km'], ['Orbit', '27.3 days'], ['Light to Earth', '1.3 s']] },
  Mars: { kind: 'Planet', wiki: 'Mars', facts: [['Diameter', '6,779 km'], ['From the Sun', '1.52 AU (228 million km)'], ['Year', '687 days'], ['Moons', '2 (Phobos, Deimos)']] },
  Jupiter: { kind: 'Planet (gas giant)', wiki: 'Jupiter', facts: [['Diameter', '139,820 km (11 Earths)'], ['From the Sun', '5.2 AU'], ['Year', '11.9 years'], ['Moons', '95']] },
  Saturn: { kind: 'Planet (gas giant)', wiki: 'Saturn', facts: [['Diameter', '116,460 km'], ['From the Sun', '9.5 AU'], ['Year', '29.4 years'], ['Rings', '7 main rings of ice and rock']] },
  Uranus: { kind: 'Planet (ice giant)', wiki: 'Uranus', facts: [['Diameter', '50,724 km'], ['From the Sun', '19.2 AU'], ['Year', '84 years'], ['Tilt', '98° — it rolls on its side']] },
  Neptune: { kind: 'Planet (ice giant)', wiki: 'Neptune', facts: [['Diameter', '49,244 km'], ['From the Sun', '30.1 AU'], ['Year', '165 years'], ['Winds', 'up to 2,100 km/h']] },
  'Alpha Centauri': { kind: 'Triple star system — the nearest', wiki: 'Alpha_Centauri', facts: [['Distance', '4.37 light-years'], ['Stars', '3 (A, B and Proxima)'], ['Planets', 'Proxima b, in the habitable zone']] },
  "Barnard's Star": { kind: 'Red dwarf', wiki: "Barnard's_Star", facts: [['Distance', '5.96 light-years'], ['Known for', 'fastest-moving star in our sky']] },
  Sirius: { kind: 'Binary star', wiki: 'Sirius', facts: [['Distance', '8.6 light-years'], ['Known for', 'the brightest star in the night sky']] },
  'Epsilon Eridani': { kind: 'Orange dwarf', wiki: 'Epsilon_Eridani', facts: [['Distance', '10.5 light-years'], ['Planets', '1 known giant planet']] },
  Procyon: { kind: 'Binary star', wiki: 'Procyon', facts: [['Distance', '11.5 light-years'], ['Constellation', 'Canis Minor']] },
  Vega: { kind: 'White star', wiki: 'Vega', facts: [['Distance', '25 light-years'], ['Constellation', 'Lyra'], ['Known for', 'will be the pole star in 12,000 years']] },
  Arcturus: { kind: 'Red giant', wiki: 'Arcturus', facts: [['Distance', '36.7 light-years'], ['Size', '25 times the Sun']] },
  Polaris: { kind: 'Yellow supergiant', wiki: 'Polaris', facts: [['Distance', '433 light-years'], ['Known for', 'the North Star']] },
  Betelgeuse: { kind: 'Red supergiant', wiki: 'Betelgeuse', facts: [['Distance', '548 light-years'], ['Size', '~760 times the Sun'], ['Future', 'will explode as a supernova']] },
  Rigel: { kind: 'Blue supergiant', wiki: 'Rigel', facts: [['Distance', '860 light-years'], ['Brightness', '~120,000 Suns']] },
  'Milky Way': { kind: 'Barred spiral galaxy — our home', wiki: 'Milky_Way', facts: [['Across', '~100,000 light-years'], ['Stars', '100–400 billion'], ['Sun from centre', '26,000 light-years'], ['One orbit of the Sun', '~230 million years']] },
  'Sagittarius A*': { kind: 'Supermassive black hole', wiki: 'Sagittarius_A*', facts: [['Mass', '4.3 million Suns'], ['Distance', '26,000 light-years'], ['First image', '2022 (Event Horizon Telescope)']] },
  Andromeda: { kind: 'Spiral galaxy', wiki: 'Andromeda_Galaxy', facts: [['Distance', '2.5 million light-years'], ['Across', '~220,000 light-years'], ['Stars', '~1 trillion'], ['Future', 'merges with the Milky Way in ~4.5 billion years']] },
  Triangulum: { kind: 'Spiral galaxy', wiki: 'Triangulum_Galaxy', facts: [['Distance', '2.73 million light-years'], ['Stars', '~40 billion']] },
  'Large Magellanic Cloud': { kind: 'Dwarf galaxy (satellite of the Milky Way)', wiki: 'Large_Magellanic_Cloud', facts: [['Distance', '160,000 light-years'], ['Seen from', 'the southern hemisphere']] },
  'Small Magellanic Cloud': { kind: 'Dwarf galaxy (satellite of the Milky Way)', wiki: 'Small_Magellanic_Cloud', facts: [['Distance', '200,000 light-years']] },
  'Local Group': { kind: 'Group of galaxies', wiki: 'Local_Group', facts: [['Across', '~10 million light-years'], ['Members', '80+ galaxies'], ['Largest', 'Andromeda and the Milky Way']] },
  'Cosmic web': { kind: 'Large-scale structure of the universe', wiki: 'Galaxy_filament', facts: [['Made of', 'filaments of galaxies around huge voids'], ['Largest structures', 'billions of light-years long']] },
  'Observable universe': { kind: 'Everything we can see', wiki: 'Observable_universe', facts: [['Across', '93 billion light-years'], ['Age', '13.8 billion years'], ['Galaxies', '~2 trillion']] },
};
