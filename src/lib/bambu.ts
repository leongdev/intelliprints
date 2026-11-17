export interface BambuColor {
  name: string;
  code: string;
  hex: string;
}

export interface BambuLine {
  material: string;
  colors: BambuColor[];
}

function colors(rows: Array<[string, string, string]>): BambuColor[] {
  return rows.map(([name, code, hex]) => ({ name, code, hex }));
}

/**
 * Bambu Lab filament lines sold as of November 2026.
 * Color names and codes are Bambu's filament codes. Hex values come from
 * Bambu's published hex tables; lines without a table use a swatch for that color.
 */
export const BAMBU_LINES: BambuLine[] = [
  {
    material: "PLA Basic",
    colors: colors([
      ["Jade White", "10100", "#FFFFFF"],
      ["Beige", "10201", "#F7E6DE"],
      ["Light Gray", "10104", "#D1D3D5"],
      ["Silver", "10102", "#A6A9AA"],
      ["Gray", "10103", "#8E9089"],
      ["Blue Grey", "10602", "#5B6579"],
      ["Dark Gray", "10105", "#545454"],
      ["Black", "10101", "#000000"],
      ["Red", "10200", "#C12E1F"],
      ["Maroon Red", "10205", "#9D2235"],
      ["Magenta", "10202", "#EC008C"],
      ["Pink", "10203", "#F55A74"],
      ["Hot Pink", "10204", "#F5547C"],
      ["Orange", "10300", "#FF6A13"],
      ["Pumpkin Orange", "10301", "#FF9016"],
      ["Gold", "10401", "#E4BD68"],
      ["Yellow", "10400", "#F4EE2A"],
      ["Sunflower Yellow", "10402", "#FEC600"],
      ["Bronze", "10801", "#847D48"],
      ["Brown", "10800", "#9D432C"],
      ["Cocoa Brown", "10802", "#6F5034"],
      ["Bright Green", "10503", "#BECF00"],
      ["Bambu Green", "10501", "#00AE42"],
      ["Green", "10500", "#54B948"],
      ["Mistletoe Green", "10502", "#3F8E43"],
      ["Turquoise", "10605", "#00B1B7"],
      ["Cyan", "10603", "#0086D6"],
      ["Cobalt Blue", "10604", "#0056B8"],
      ["Blue", "10601", "#0A2989"],
      ["Purple", "10700", "#5E43B7"],
      ["Indigo Purple", "10701", "#482960"],
    ]),
  },
  {
    material: "PLA Matte",
    colors: colors([
      ["Ivory White", "11100", "#FFFFFF"],
      ["Bone White", "11103", "#CBC6B8"],
      ["Ash Gray", "11102", "#9B9EA0"],
      ["Nardo Gray", "11104", "#757575"],
      ["Charcoal", "11101", "#000000"],
      ["Scarlet Red", "11200", "#DE4343"],
      ["Dark Red", "11202", "#BB3D43"],
      ["Plum", "11204", "#950051"],
      ["Sakura Pink", "11201", "#E8AFCF"],
      ["Terracotta", "11203", "#B15533"],
      ["Mandarin Orange", "11300", "#F99963"],
      ["Lemon Yellow", "11400", "#F7D959"],
      ["Desert Tan", "11401", "#E8DBB7"],
      ["Latte Brown", "11800", "#D3B7A7"],
      ["Caramel", "11803", "#AE835B"],
      ["Dark Brown", "11801", "#7D6556"],
      ["Dark Chocolate", "11802", "#4D3324"],
      ["Apple Green", "11502", "#C2E189"],
      ["Grass Green", "11500", "#61C680"],
      ["Dark Green", "11501", "#68724D"],
      ["Ice Blue", "11601", "#A3D8E1"],
      ["Sky Blue", "11603", "#56B7E6"],
      ["Marine Blue", "11600", "#0078BF"],
      ["Dark Blue", "11602", "#042F56"],
      ["Lilac Purple", "11700", "#AE96D4"],
    ]),
  },
  {
    material: "PETG Basic",
    colors: colors([
      ["Orange", "30301", "#FF671F"],
      ["Red", "30201", "#D6001C"],
      ["Yellow", "30402", "#FCE300"],
      ["Green", "30502", "#009639"],
      ["Navy Blue", "30604", "#0086D6"],
      ["Reflex Blue", "30603", "#001489"],
      ["White", "30106", "#FFFFFF"],
      ["Dark Beige", "30403", "#DBC8B6"],
      ["Black", "30105", "#000000"],
      ["Dark Brown", "30800", "#4F2C1D"],
      ["Misty Blue", "30108", "#688197"],
      ["Gray", "30107", "#7F7E83"],
      ["Pine Green", "30503", "#034638"],
      ["Lime Green", "30404", "#B5E61D"],
      ["Clear", "30103", "#F4F4F4"],
    ]),
  },
  {
    material: "PETG HF",
    colors: colors([
      ["White", "33100", "#FFFFFF"],
      ["Cream", "33401", "#F9DFB9"],
      ["Gray", "33101", "#ADB1B2"],
      ["Dark Gray", "33103", "#515151"],
      ["Black", "33102", "#000000"],
      ["Red", "33200", "#EB3A3A"],
      ["Orange", "33300", "#F75403"],
      ["Yellow", "33400", "#FFD00B"],
      ["Peanut Brown", "33801", "#875718"],
      ["Lime Green", "33501", "#6EE53C"],
      ["Green", "33500", "#00AE42"],
      ["Forest Green", "33502", "#39541A"],
      ["Lake Blue", "33601", "#1F79E5"],
      ["Blue", "33600", "#002E96"],
    ]),
  },
  {
    material: "PETG Translucent",
    colors: colors([
      ["Clear", "32101", "#FFFFFF"],
      ["Gray", "32100", "#8E8E8E"],
      ["Light Blue", "32600", "#61B0FF"],
      ["Teal", "32501", "#77EDD7"],
      ["Olive", "32500", "#748C45"],
      ["Orange", "32300", "#FF911A"],
      ["Brown", "32800", "#C9A381"],
      ["Pink", "32200", "#F9C1BD"],
      ["Purple", "32700", "#D6ABFF"],
    ]),
  },
  {
    material: "PETG Matte",
    colors: colors([
      ["White", "35100", "#FFFFFF"],
      ["Gray", "35102", "#7F7E83"],
      ["Black", "35101", "#000000"],
      ["Lime", "35500", "#C0DF16"],
      ["Avocado Green", "35501", "#BCE194"],
      ["Pink", "35700", "#FABBCB"],
      ["Baby Blue", "35600", "#B9D9EB"],
      ["Violet", "35702", "#A7A4E0"],
    ]),
  },
  {
    material: "PETG-CF",
    colors: colors([
      ["Brick Red", "31200", "#9F332A"],
      ["Violet Purple", "31700", "#583061"],
      ["Indigo Blue", "31600", "#324585"],
      ["Malachite Green", "31500", "#16B08E"],
      ["Titan Gray", "31101", "#565656"],
      ["Black", "31100", "#000000"],
    ]),
  },
  {
    material: "ABS",
    colors: colors([
      ["White", "40100", "#FFFFFF"],
      ["Silver", "40102", "#87909A"],
      ["Black", "40101", "#000000"],
      ["Red", "40200", "#D32941"],
      ["Orange", "40300", "#FF6A13"],
      ["Tangerine Yellow", "40402", "#FFC72C"],
      ["Yellow", "40400", "#F4EE2A"],
      ["Bambu Green", "40500", "#00AE42"],
      ["Olive", "40502", "#789D4A"],
      ["Azure", "40601", "#489FDF"],
      ["Blue", "40600", "#0A2CA5"],
      ["Navy Blue", "40602", "#0C2340"],
      ["Lavender", "40701", "#AE96D4"],
    ]),
  },
  {
    material: "ASA",
    colors: colors([
      ["White", "45100", "#FFFAF2"],
      ["Gray", "45102", "#8A949E"],
      ["Red", "45200", "#E02928"],
      ["Green", "45500", "#00A6A0"],
      ["Blue", "45600", "#2140B4"],
      ["Black", "45101", "#000000"],
    ]),
  },
  {
    material: "TPU 95A HF",
    colors: colors([
      ["White", "51102", "#FFFFFF"],
      ["Yellow", "51400", "#F3E600"],
      ["Red", "51200", "#C8102E"],
      ["Blue", "51600", "#0072CE"],
      ["Gray", "51101", "#898D8D"],
      ["Black", "51100", "#101820"],
    ]),
  },
  {
    material: "PLA Pure",
    colors: colors([
      ["Pure White", "17100", "#FFFFFF"],
      ["Absolute Black", "17101", "#000000"],
      ["Milky Pink", "17200", "#F4C9D0"],
      ["Apricot", "17300", "#F4B183"],
      ["Baby Blue", "17600", "#A8C6EE"],
    ]),
  },
  {
    material: "PLA Silk+",
    colors: colors([
      ["White", "13110", "#FFFFFF"],
      ["Silver", "13109", "#C8C8C8"],
      ["Titan Gray", "13108", "#5F6367"],
      ["Baby Blue", "13603", "#A8C6EE"],
      ["Blue", "13604", "#008BDA"],
      ["Mint", "13507", "#96DCB9"],
      ["Candy Green", "13506", "#018814"],
      ["Purple", "13702", "#8671CB"],
      ["Pink", "13207", "#F7ADA6"],
      ["Rose Gold", "13206", "#BA9594"],
      ["Candy Red", "13205", "#D02727"],
      ["Champagne", "13404", "#F3CFB2"],
      ["Gold", "13405", "#F4A925"],
    ]),
  },
  {
    material: "PLA Silk Multi-Color",
    colors: colors([
      ["Gilded Rose", "13901", "#C4A484"],
      ["Midnight Blaze", "13902", "#1A1A2E"],
      ["Neon City", "13903", "#39FF14"],
      ["Blue Hawaii", "13904", "#1CA9C9"],
      ["Velvet Eclipse", "13905", "#2B0000"],
      ["South Beach", "13906", "#FF6B9A"],
      ["Aurora Purple", "13909", "#7B2D8E"],
      ["Dawn Radiance", "13912", "#F4A261"],
      ["Mystic Magenta", "13913", "#C71585"],
      ["Phantom Blue", "13916", "#1B3A6B"],
    ]),
  },
  {
    material: "PLA Translucent",
    colors: colors([
      ["Red", "13210", "#B50011"],
      ["Cherry Pink", "13211", "#F5B6CD"],
      ["Orange", "13301", "#F74E02"],
      ["Mellow Yellow", "13410", "#F5DBAB"],
      ["Light Jade", "13510", "#96D8AF"],
      ["Ice Blue", "13610", "#B8CDE9"],
      ["Blue", "13611", "#0047BB"],
      ["Teal", "13612", "#009FA1"],
      ["Purple", "13710", "#8344B0"],
      ["Lavender", "13711", "#B8ACD6"],
    ]),
  },
  {
    material: "PLA Tough+",
    colors: colors([
      ["White", "12107", "#FFFFFF"],
      ["Gray", "12105", "#AFB1AE"],
      ["Silver", "12106", "#959698"],
      ["Black", "12104", "#000000"],
      ["Orange", "12301", "#DC3A27"],
      ["Yellow", "12401", "#F4D53F"],
      ["Cyan", "12601", "#009BD8"],
    ]),
  },
  {
    material: "PLA-CF",
    colors: colors([
      ["Burgundy Red", "14200", "#951E23"],
      ["Iris Purple", "14700", "#69398E"],
      ["Matcha Green", "14500", "#5C9748"],
      ["Jeans Blue", "14600", "#6E88BC"],
      ["Royal Blue", "14601", "#2842AD"],
      ["Lava Gray", "14101", "#4D5054"],
      ["Black", "14100", "#000000"],
    ]),
  },
  {
    material: "PLA Basic Gradient",
    colors: colors([
      ["Arctic Whisper", "10900", "#D6EEF5"],
      ["Solar Breeze", "10901", "#F6C445"],
      ["Ocean to Meadow", "10902", "#4A90A4"],
      ["Pink Citrus", "10903", "#F48FB1"],
      ["Mint Lime", "10904", "#98D8A0"],
      ["Blueberry Bubblegum", "10905", "#6B5B95"],
      ["Dusk Glare", "10906", "#E07A3D"],
      ["Cotton Candy Cloud", "10907", "#F7C6D0"],
    ]),
  },
  {
    material: "PLA Sparkle",
    colors: colors([
      ["Crimson Red Sparkle", "13200", "#9B2335"],
      ["Royal Purple Sparkle", "13700", "#6A3D9A"],
      ["Slate Gray Sparkle", "13102", "#8E9089"],
      ["Alpine Green Sparkle", "13501", "#3E6B4F"],
      ["Onyx Black Sparkle", "13101", "#1A1A1A"],
      ["Classic Gold Sparkle", "13402", "#C5A059"],
    ]),
  },
  {
    material: "PLA Metal",
    colors: colors([
      ["Iron Gray Metallic", "13100", "#6E6A65"],
      ["Iridium Gold Metallic", "13400", "#C6A15B"],
      ["Oxide Green Metallic", "13500", "#5E7A4A"],
      ["Cobalt Blue Metallic", "13600", "#2E4A7A"],
      ["Copper Brown Metallic", "13800", "#8C5A3C"],
    ]),
  },
  {
    material: "PLA Marble",
    colors: colors([
      ["White Marble", "13103", "#F4F1EC"],
      ["Red Granite", "13201", "#A33B3B"],
    ]),
  },
  {
    material: "PLA Galaxy",
    colors: colors([
      ["Purple", "13602", "#5C2D91"],
      ["Green", "13503", "#1F7A4D"],
      ["Nebulae", "13504", "#2E4A7A"],
      ["Brown", "13203", "#6B3E2E"],
    ]),
  },
  {
    material: "PLA Wood",
    colors: colors([
      ["Classic Birch", "13505", "#E4C99A"],
      ["Black Walnut", "13107", "#3E2A1F"],
      ["Clay Brown", "13801", "#A67C52"],
      ["Rosewood", "13204", "#7A3B3B"],
      ["White Oak", "13106", "#E8DCC4"],
      ["Ochre Yellow", "13403", "#C4A035"],
    ]),
  },
  {
    material: "PLA Glow",
    colors: colors([
      ["Glow Orange", "15300", "#FF6A13"],
      ["Glow Yellow", "15400", "#F4EE2A"],
      ["Glow Green", "15500", "#7DCE62"],
      ["Glow Blue", "15600", "#1E4D8C"],
      ["Glow Pink", "15200", "#F7ADA6"],
    ]),
  },
  {
    material: "ABS-GF",
    colors: colors([
      ["White", "41100", "#FFFFFF"],
      ["Gray", "41102", "#C6C6C6"],
      ["Black", "41101", "#000000"],
      ["Red", "41200", "#E83100"],
      ["Orange", "41300", "#F48438"],
      ["Yellow", "41400", "#F4EE2A"],
      ["Green", "41500", "#00AE42"],
      ["Blue", "41600", "#0C3B95"],
    ]),
  },
  {
    material: "ASA Aero",
    colors: colors([["White", "46100", "#FFFAF2"]]),
  },
  {
    material: "ASA-CF",
    colors: colors([["Black", "46101", "#000000"]]),
  },
  {
    material: "PC",
    colors: colors([
      ["White", "60100", "#FFFFFF"],
      ["Transparent", "60103", "#F2F2F2"],
      ["Clear Black", "60102", "#1C1C1C"],
      ["Black", "60101", "#000000"],
    ]),
  },
  {
    material: "PC FR",
    colors: colors([
      ["White", "63101", "#FFFFFF"],
      ["Gray", "63102", "#A8A8AA"],
      ["Black", "63100", "#000000"],
    ]),
  },
  {
    material: "TPU for AMS",
    colors: colors([
      ["White", "53100", "#FFFFFF"],
      ["Gray", "53102", "#939393"],
      ["Black", "53101", "#000000"],
      ["Red", "53200", "#ED0000"],
      ["Yellow", "53400", "#F9EF41"],
      ["Neon Green", "53500", "#90FF1A"],
      ["Blue", "53600", "#5898DD"],
    ]),
  },
  {
    material: "TPU 85A",
    colors: colors([
      ["White", "51105", "#FFFFFF"],
      ["Black", "51103", "#000000"],
      ["Light Cyan", "51500", "#C3E2D6"],
      ["Neon Orange", "51305", "#F68B1B"],
      ["Frozen", "51900", "#40B6E4"],
      ["Blaze", "51901", "#D21B3C"],
    ]),
  },
  {
    material: "TPU 90A",
    colors: colors([
      ["White", "51105", "#FFFFFF"],
      ["Black", "51103", "#000000"],
      ["Light Cyan", "51500", "#C3E2D6"],
      ["Neon Orange", "51305", "#F68B1B"],
      ["Frozen", "51900", "#40B6E4"],
      ["Blaze", "51901", "#D21B3C"],
    ]),
  },
  {
    material: "PAHT-CF",
    colors: colors([["Black", "70100", "#000000"]]),
  },
  {
    material: "PA6-CF",
    colors: colors([["Black", "72100", "#000000"]]),
  },
  {
    material: "PA6-GF",
    colors: colors([
      ["White", "72102", "#EAEAE4"],
      ["Gray", "72103", "#9A9A9A"],
      ["Black", "72104", "#000000"],
      ["Orange", "72200", "#FF4800"],
      ["Yellow", "72400", "#FFCE00"],
      ["Lime", "72500", "#C5ED48"],
      ["Blue", "72600", "#75AED8"],
      ["Brown", "72800", "#5B492F"],
    ]),
  },
  {
    material: "PET-CF",
    colors: colors([["Black", "71100", "#000000"]]),
  },
  {
    material: "PPA-CF",
    colors: colors([["Black", "73100", "#000000"]]),
  },
  {
    material: "PPS-CF",
    colors: colors([["Black", "76100", "#000000"]]),
  },
  {
    material: "Support for PLA",
    colors: colors([["White", "65104", "#FFFFFF"]]),
  },
  {
    material: "Support for PLA/PETG",
    colors: colors([
      ["Nature", "65102", "#F3EDE4"],
      ["Black", "65103", "#000000"],
    ]),
  },
  {
    material: "Support for ABS",
    colors: colors([["White", "66100", "#FFFFFF"]]),
  },
  {
    material: "Support for PA/PET",
    colors: colors([["Green", "65500", "#00A651"]]),
  },
  {
    material: "PVA",
    colors: colors([["Clear", "66400", "#F7F7F7"]]),
  },
];

export const MATERIALS = BAMBU_LINES.map((line) => line.material) as [
  "PLA Basic",
  "PLA Matte",
  "PETG Basic",
  "PETG HF",
  "PETG Translucent",
  "PETG Matte",
  "PETG-CF",
  "ABS",
  "ASA",
  "TPU 95A HF",
  "PLA Pure",
  "PLA Silk+",
  "PLA Silk Multi-Color",
  "PLA Translucent",
  "PLA Tough+",
  "PLA-CF",
  "PLA Basic Gradient",
  "PLA Sparkle",
  "PLA Metal",
  "PLA Marble",
  "PLA Galaxy",
  "PLA Wood",
  "PLA Glow",
  "ABS-GF",
  "ASA Aero",
  "ASA-CF",
  "PC",
  "PC FR",
  "TPU for AMS",
  "TPU 85A",
  "TPU 90A",
  "PAHT-CF",
  "PA6-CF",
  "PA6-GF",
  "PET-CF",
  "PPA-CF",
  "PPS-CF",
  "Support for PLA",
  "Support for PLA/PETG",
  "Support for ABS",
  "Support for PA/PET",
  "PVA",
];

const ALL_COLORS = BAMBU_LINES.flatMap((line) => line.colors.map((color) => ({ ...color, material: line.material })));

export function colorsFor(material: string) {
  return BAMBU_LINES.find((line) => line.material === material)?.colors ?? BAMBU_LINES[0].colors;
}

export function bambuColorLabel(color: BambuColor) {
  return `${color.name}(${color.code})`;
}

export function matchBambuColor(color: string, hex = "", material = "") {
  const compact = color.toLowerCase().replace(/[^a-z0-9]/g, "");
  const preferred = material ? ALL_COLORS.filter((item) => item.material === material) : [];
  const byCode =
    preferred.find((item) => compact.includes(item.code)) ??
    ALL_COLORS.find((item) => compact.includes(item.code));
  if (byCode) return byCode;
  const pool = preferred.length > 0 ? preferred : ALL_COLORS;
  const named = pool
    .filter((item) => compact.includes(item.name.toLowerCase().replace(/[^a-z0-9]/g, "")))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (named) return named;
  return pool.find((item) => hex && item.hex.toLowerCase() === hex.toLowerCase());
}
