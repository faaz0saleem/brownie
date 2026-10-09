<?php
// What Fudgio sells and where it sends it.
//
// Kept apart from db.php because none of this is storage: it is the catalogue
// a fresh database is seeded with, the countries checkout accepts, the order
// lifecycle, and the rules for pricing an order in the right currency. The
// storefront mirrors the catalogue in assets/store.js so a page is never blank
// while the API loads, and the API always wins once it answers.
declare(strict_types=1);

/* ---------------- catalogue ----------------
   One print, eight colours. Every bandana is the same size and the same
   design; the colour is the only choice. `price` is PKR (Pakistan, cash on
   delivery) and `usd` the international price, both editable per colour in
   the admin. Anything left blank there is derived by size_usd() below.

   There are no multipacks: the deal is "buy any 3, save 15%" across colours,
   worked out per order by bundle_discount().                              */
function bandana_sizes(): array {
  return [['label' => '55 cm square', 'pieces' => 1, 'price' => 4200, 'usd' => 15]];
}

/** The spec chips shown on every product page. */
function bandana_details(): array {
  return ['100% cotton', '55 × 55 cm (22")', 'Hemmed edges', 'Colourfast print', 'Machine washable'];
}

/** [slug, name, ground colour, print colour, tagline, description] */
function bandana_colours(): array {
  return [
    ['classic-red', 'Classic Red', '#C3201B', '#F3EDE0', 'The original',
      'Bright red with a cream print: the one everybody pictures when you say bandana. Tie it on your head, knot it at your neck or let it hang from a back pocket.'],
    ['jet-black', 'Jet Black', '#161616', '#EFECE6', 'Goes with everything',
      'Deep black with a cream print. The easiest one to wear, with a white tee, a black hoodie or a suit you want to make less serious.'],
    ['navy', 'Navy', '#1D2B5C', '#EFECE6', 'Sharp with denim',
      'Dark navy with a cream print. Looks right with jeans, a denim jacket or anything white, and never looks loud.'],
    ['forest-green', 'Forest Green', '#1F4B38', '#EFECE6', 'Deep and earthy',
      'A deep forest green with a cream print. Works with khaki, olive, black and white, and looks good on a tote.'],
    ['mustard', 'Mustard', '#D9A21B', '#141414', 'The loud one',
      'Warm mustard yellow with a black print. The colour that turns a plain outfit into one people remember.'],
    ['bone', 'Bone', '#F6F2E8', '#141414', 'Clean and light',
      'Off-white with a black print. The lightest of the eight, and the one to wear all summer.'],
    ['plum', 'Plum', '#4B2447', '#EFECE6', 'Rich, not loud',
      'Dark plum with a cream print. A colour that looks expensive and goes with black, grey and denim.'],
    ['rust', 'Rust', '#B4512A', '#F3EDE0', 'Warm and worn-in',
      'Burnt orange-brown with a cream print. Looks like it has been worn for years from the first day.'],
  ];
}

function bandana_catalog(): array {
  $out = [];
  foreach (bandana_colours() as $i => [$slug, $name, $color, $ink, $tagline, $desc]) {
    $out[] = ['slug' => $slug, 'name' => $name, 'color' => $color, 'ink' => $ink,
      'tagline' => $tagline, 'description' => $desc, 'sort' => $i, 'emoji' => '',
      'gradient' => $color, 'sizes' => bandana_sizes(), 'details' => bandana_details(),
      'stock' => 50, 'featured' => true];
  }
  return $out;
}

/** Slugs retired by db_migrate(): the old brownies, and the first bandana range that never shipped. */
function retired_slugs(): array {
  return ['chocolate', 'nutty-delight', 'salted-caramel',
    'midnight-paisley', 'blush-paisley', 'ember-paisley', 'ivory-paisley', 'checkmate-gingham', 'bloom-floral'];
}

/** A #RRGGBB colour, or '' if it is not one. */
function clean_hex($v): string {
  $v = trim((string)$v);
  return preg_match('/^#[0-9a-f]{6}$/i', $v) ? strtoupper($v) : '';
}

/* ---------------- order lifecycle ----------------
   "Awaiting Payment" is where every international order starts: it has to be
   paid before it ships. Pakistani orders are cash on delivery and start at
   "Pending". "Out for Delivery" stays for local riders; "Shipped" is courier. */
function order_statuses(): array {
  return ['Awaiting Payment', 'Pending', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
}
/** Orders still needing work from the shop. */
function open_statuses(): array { return ['Awaiting Payment', 'Pending', 'Confirmed', 'Packed']; }

/* ---------------- pricing ---------------- */

/** True for orders paid in cash on delivery, in rupees. */
function is_domestic(string $country): bool { return strtoupper(trim($country)) === 'PK'; }

/**
 * A size's international price in whole dollars. Uses the price set on the
 * size when there is one; otherwise converts the rupee price at the admin's
 * rate and rounds UP, so a missing USD price can never undercharge.
 */
function size_usd(array $size, int $rate): int {
  if (isset($size['usd']) && (int)$size['usd'] > 0) return (int)$size['usd'];
  $rate = max(1, $rate);
  return max(1, (int) ceil(((int)($size['price'] ?? 0)) / $rate));
}

/**
 * The mix-and-match deal: an order with at least `bundleQty` bandanas, in any
 * colours, takes `bundlePct`% off the bandanas. Worked out on the server from
 * the admin's settings so the discount can't be set by the browser. Returns
 * the discount in the order's own currency, rounded to a whole unit.
 */
function bundle_discount(int $units, int $subtotal, array $s): int {
  $qty = max(2, (int)($s['bundleQty'] ?? 3));
  $pct = max(0, min(90, (int)($s['bundlePct'] ?? 15)));
  if ($pct === 0 || $units < $qty || $subtotal <= 0) return 0;
  return (int) round($subtotal * $pct / 100);
}

/* ---------------- countries ----------------
   Every inhabited ISO 3166-1 country except North Korea, named in English.
   Generated from ICU (Intl.DisplayNames) rather than typed by hand.        */
function countries(): array {
  return [
    'AF' => 'Afghanistan',
    'AX' => 'Åland Islands',
    'AL' => 'Albania',
    'DZ' => 'Algeria',
    'AS' => 'American Samoa',
    'AD' => 'Andorra',
    'AO' => 'Angola',
    'AI' => 'Anguilla',
    'AG' => 'Antigua & Barbuda',
    'AR' => 'Argentina',
    'AM' => 'Armenia',
    'AW' => 'Aruba',
    'AU' => 'Australia',
    'AT' => 'Austria',
    'AZ' => 'Azerbaijan',
    'BS' => 'Bahamas',
    'BH' => 'Bahrain',
    'BD' => 'Bangladesh',
    'BB' => 'Barbados',
    'BY' => 'Belarus',
    'BE' => 'Belgium',
    'BZ' => 'Belize',
    'BJ' => 'Benin',
    'BM' => 'Bermuda',
    'BT' => 'Bhutan',
    'BO' => 'Bolivia',
    'BA' => 'Bosnia & Herzegovina',
    'BW' => 'Botswana',
    'BR' => 'Brazil',
    'IO' => 'British Indian Ocean Territory',
    'VG' => 'British Virgin Islands',
    'BN' => 'Brunei',
    'BG' => 'Bulgaria',
    'BF' => 'Burkina Faso',
    'BI' => 'Burundi',
    'KH' => 'Cambodia',
    'CM' => 'Cameroon',
    'CA' => 'Canada',
    'CV' => 'Cape Verde',
    'BQ' => 'Caribbean Netherlands',
    'KY' => 'Cayman Islands',
    'CF' => 'Central African Republic',
    'TD' => 'Chad',
    'CL' => 'Chile',
    'CN' => 'China',
    'CX' => 'Christmas Island',
    'CC' => 'Cocos (Keeling) Islands',
    'CO' => 'Colombia',
    'KM' => 'Comoros',
    'CG' => 'Congo - Brazzaville',
    'CD' => 'Congo - Kinshasa',
    'CK' => 'Cook Islands',
    'CR' => 'Costa Rica',
    'CI' => 'Côte d’Ivoire',
    'HR' => 'Croatia',
    'CU' => 'Cuba',
    'CW' => 'Curaçao',
    'CY' => 'Cyprus',
    'CZ' => 'Czechia',
    'DK' => 'Denmark',
    'DJ' => 'Djibouti',
    'DM' => 'Dominica',
    'DO' => 'Dominican Republic',
    'EC' => 'Ecuador',
    'EG' => 'Egypt',
    'SV' => 'El Salvador',
    'GQ' => 'Equatorial Guinea',
    'ER' => 'Eritrea',
    'EE' => 'Estonia',
    'SZ' => 'Eswatini',
    'ET' => 'Ethiopia',
    'FK' => 'Falkland Islands',
    'FO' => 'Faroe Islands',
    'FJ' => 'Fiji',
    'FI' => 'Finland',
    'FR' => 'France',
    'GF' => 'French Guiana',
    'PF' => 'French Polynesia',
    'GA' => 'Gabon',
    'GM' => 'Gambia',
    'GE' => 'Georgia',
    'DE' => 'Germany',
    'GH' => 'Ghana',
    'GI' => 'Gibraltar',
    'GR' => 'Greece',
    'GL' => 'Greenland',
    'GD' => 'Grenada',
    'GP' => 'Guadeloupe',
    'GU' => 'Guam',
    'GT' => 'Guatemala',
    'GG' => 'Guernsey',
    'GN' => 'Guinea',
    'GW' => 'Guinea-Bissau',
    'GY' => 'Guyana',
    'HT' => 'Haiti',
    'HN' => 'Honduras',
    'HK' => 'Hong Kong SAR China',
    'HU' => 'Hungary',
    'IS' => 'Iceland',
    'IN' => 'India',
    'ID' => 'Indonesia',
    'IR' => 'Iran',
    'IQ' => 'Iraq',
    'IE' => 'Ireland',
    'IM' => 'Isle of Man',
    'IL' => 'Israel',
    'IT' => 'Italy',
    'JM' => 'Jamaica',
    'JP' => 'Japan',
    'JE' => 'Jersey',
    'JO' => 'Jordan',
    'KZ' => 'Kazakhstan',
    'KE' => 'Kenya',
    'KI' => 'Kiribati',
    'KW' => 'Kuwait',
    'KG' => 'Kyrgyzstan',
    'LA' => 'Laos',
    'LV' => 'Latvia',
    'LB' => 'Lebanon',
    'LS' => 'Lesotho',
    'LR' => 'Liberia',
    'LY' => 'Libya',
    'LI' => 'Liechtenstein',
    'LT' => 'Lithuania',
    'LU' => 'Luxembourg',
    'MO' => 'Macao SAR China',
    'MG' => 'Madagascar',
    'MW' => 'Malawi',
    'MY' => 'Malaysia',
    'MV' => 'Maldives',
    'ML' => 'Mali',
    'MT' => 'Malta',
    'MH' => 'Marshall Islands',
    'MQ' => 'Martinique',
    'MR' => 'Mauritania',
    'MU' => 'Mauritius',
    'YT' => 'Mayotte',
    'MX' => 'Mexico',
    'FM' => 'Micronesia',
    'MD' => 'Moldova',
    'MC' => 'Monaco',
    'MN' => 'Mongolia',
    'ME' => 'Montenegro',
    'MS' => 'Montserrat',
    'MA' => 'Morocco',
    'MZ' => 'Mozambique',
    'MM' => 'Myanmar (Burma)',
    'NA' => 'Namibia',
    'NR' => 'Nauru',
    'NP' => 'Nepal',
    'NL' => 'Netherlands',
    'NC' => 'New Caledonia',
    'NZ' => 'New Zealand',
    'NI' => 'Nicaragua',
    'NE' => 'Niger',
    'NG' => 'Nigeria',
    'NU' => 'Niue',
    'NF' => 'Norfolk Island',
    'MK' => 'North Macedonia',
    'MP' => 'Northern Mariana Islands',
    'NO' => 'Norway',
    'OM' => 'Oman',
    'PK' => 'Pakistan',
    'PW' => 'Palau',
    'PS' => 'Palestinian Territories',
    'PA' => 'Panama',
    'PG' => 'Papua New Guinea',
    'PY' => 'Paraguay',
    'PE' => 'Peru',
    'PH' => 'Philippines',
    'PN' => 'Pitcairn Islands',
    'PL' => 'Poland',
    'PT' => 'Portugal',
    'PR' => 'Puerto Rico',
    'QA' => 'Qatar',
    'RE' => 'Réunion',
    'RO' => 'Romania',
    'RU' => 'Russia',
    'RW' => 'Rwanda',
    'WS' => 'Samoa',
    'SM' => 'San Marino',
    'ST' => 'São Tomé & Príncipe',
    'SA' => 'Saudi Arabia',
    'SN' => 'Senegal',
    'RS' => 'Serbia',
    'SC' => 'Seychelles',
    'SL' => 'Sierra Leone',
    'SG' => 'Singapore',
    'SX' => 'Sint Maarten',
    'SK' => 'Slovakia',
    'SI' => 'Slovenia',
    'SB' => 'Solomon Islands',
    'SO' => 'Somalia',
    'ZA' => 'South Africa',
    'KR' => 'South Korea',
    'SS' => 'South Sudan',
    'ES' => 'Spain',
    'LK' => 'Sri Lanka',
    'BL' => 'St. Barthélemy',
    'SH' => 'St. Helena',
    'KN' => 'St. Kitts & Nevis',
    'LC' => 'St. Lucia',
    'MF' => 'St. Martin',
    'PM' => 'St. Pierre & Miquelon',
    'VC' => 'St. Vincent & Grenadines',
    'SD' => 'Sudan',
    'SR' => 'Suriname',
    'SJ' => 'Svalbard & Jan Mayen',
    'SE' => 'Sweden',
    'CH' => 'Switzerland',
    'SY' => 'Syria',
    'TW' => 'Taiwan',
    'TJ' => 'Tajikistan',
    'TZ' => 'Tanzania',
    'TH' => 'Thailand',
    'TL' => 'Timor-Leste',
    'TG' => 'Togo',
    'TK' => 'Tokelau',
    'TO' => 'Tonga',
    'TT' => 'Trinidad & Tobago',
    'TN' => 'Tunisia',
    'TR' => 'Türkiye',
    'TM' => 'Turkmenistan',
    'TC' => 'Turks & Caicos Islands',
    'TV' => 'Tuvalu',
    'VI' => 'U.S. Virgin Islands',
    'UG' => 'Uganda',
    'UA' => 'Ukraine',
    'AE' => 'United Arab Emirates',
    'GB' => 'United Kingdom',
    'US' => 'United States',
    'UY' => 'Uruguay',
    'UZ' => 'Uzbekistan',
    'VU' => 'Vanuatu',
    'VA' => 'Vatican City',
    'VE' => 'Venezuela',
    'VN' => 'Vietnam',
    'WF' => 'Wallis & Futuna',
    'EH' => 'Western Sahara',
    'YE' => 'Yemen',
    'ZM' => 'Zambia',
    'ZW' => 'Zimbabwe',
  ];
}
function country_name(string $code): string {
  $c = countries();
  $code = strtoupper(trim($code));
  return $c[$code] ?? '';
}
