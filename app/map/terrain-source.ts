// The terrain source's metadata (no map code), so the credits registry and
// unit tests can read it without loading the map library.
export const terrainSource = {
  id: 'mapterhorn',
  name: 'Mapterhorn terrain',
  url: 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp',
  licence: 'Open data, various (in Canada: NRCan, Open Government Licence – Canada)',
  attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>',
  link: 'https://mapterhorn.com/attribution',
  offline: true,
} as const;
