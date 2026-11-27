// How many of Open-Meteo's free "API calls" a request counts as, by the rule
// on Open-Meteo's own pricing page (checked Nov 27, 2026, in the website's
// source, github.com/open-meteo/open-meteo-website, src/routes/en/pricing):
//
//   nVariablesModels = variables x max(models, 1)
//   timeWeight       = days / 14
//   variablesWeight  = nVariablesModels / 10
//   calls            = max(1, max(variablesWeight, timeWeight x variablesWeight)) x locations
//
// "Requests for data covering more than 10 weather variables or extending over
// a period of more than 2 weeks for a single location are considered multiple
// API calls." Free limits: 600 a minute, 5,000 an hour, 10,000 a day, per IP
// address (terms page).
export function apiCalls(u) {
  const url = new URL(u);
  if (!/open-meteo\.com$/.test(url.hostname) || !url.hostname.includes('api')) return 0;
  const p = url.searchParams;
  const list = (k) => (p.get(k) ?? '').split(',').filter(Boolean);
  const variables = list('hourly').length + list('daily').length + list('current').length + list('minutely_15').length;
  const models = Math.max(1, list('models').length);
  const locations = Math.max(1, list('latitude').length);
  let days;
  if (p.get('start_hour') && p.get('end_hour')) days = (new Date(p.get('end_hour')) - new Date(p.get('start_hour'))) / 864e5;
  else if (p.get('start_date') && p.get('end_date')) days = (new Date(p.get('end_date')) - new Date(p.get('start_date'))) / 864e5 + 1;
  else days = Number(p.get('forecast_days') ?? (p.get('forecast_hours') ? Number(p.get('forecast_hours')) / 24 : 7)) + Number(p.get('past_days') ?? 0) + Number(p.get('past_hours') ?? 0) / 24;
  const vw = (variables * models) / 10;
  return Math.max(1, Math.max(vw, (days / 14) * vw)) * locations;
}
