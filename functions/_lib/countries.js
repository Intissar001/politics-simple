// ISO country codes + English names. Used by /api/countries and the news router.
export const COUNTRIES = [
  ["WORLD", "World (all countries)"],
  ["AR", "Argentina"], ["AU", "Australia"], ["AT", "Austria"], ["BD", "Bangladesh"],
  ["BE", "Belgium"], ["BR", "Brazil"], ["BG", "Bulgaria"], ["CA", "Canada"],
  ["CL", "Chile"], ["CN", "China"], ["CO", "Colombia"], ["CZ", "Czechia"],
  ["DK", "Denmark"], ["EG", "Egypt"], ["ET", "Ethiopia"], ["FI", "Finland"],
  ["FR", "France"], ["DE", "Germany"], ["GH", "Ghana"], ["GR", "Greece"],
  ["HK", "Hong Kong"], ["HU", "Hungary"], ["IN", "India"], ["ID", "Indonesia"],
  ["IR", "Iran"], ["IQ", "Iraq"], ["IE", "Ireland"], ["IL", "Israel"],
  ["IT", "Italy"], ["JP", "Japan"], ["JO", "Jordan"], ["KE", "Kenya"],
  ["LB", "Lebanon"], ["MY", "Malaysia"], ["MX", "Mexico"], ["MA", "Morocco"],
  ["NL", "Netherlands"], ["NZ", "New Zealand"], ["NG", "Nigeria"], ["NO", "Norway"],
  ["PK", "Pakistan"], ["PE", "Peru"], ["PH", "Philippines"], ["PL", "Poland"],
  ["PT", "Portugal"], ["QA", "Qatar"], ["RO", "Romania"], ["RU", "Russia"],
  ["SA", "Saudi Arabia"], ["SN", "Senegal"], ["RS", "Serbia"], ["SG", "Singapore"],
  ["ZA", "South Africa"], ["KR", "South Korea"], ["ES", "Spain"], ["LK", "Sri Lanka"],
  ["SE", "Sweden"], ["CH", "Switzerland"], ["TW", "Taiwan"], ["TZ", "Tanzania"],
  ["TH", "Thailand"], ["TN", "Tunisia"], ["TR", "Turkey"], ["UG", "Uganda"],
  ["UA", "Ukraine"], ["AE", "United Arab Emirates"], ["GB", "United Kingdom"],
  ["US", "United States"], ["VE", "Venezuela"], ["VN", "Vietnam"], ["ZW", "Zimbabwe"],
  ["DZ", "Algeria"], ["LY", "Libya"], ["SD", "Sudan"], ["SY", "Syria"],
  ["PS", "Palestine"], ["YE", "Yemen"], ["KW", "Kuwait"], ["OM", "Oman"],
].map(([code, name]) => ({ code, name }));

export const COUNTRY_NAME = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.name]));
