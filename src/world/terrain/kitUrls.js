/**
 * MegaKit shortlist URLs with Nature Pack fallbacks (Passo 10).
 * Prefer stylized-nature when the file exists in public/; else nature.
 * Presence is checked once via HEAD-less fetch at register time is heavy —
 * instead we probe with a sync list built from known-committed shortlist,
 * and still document fallbacks for agents that omit assets.
 */

const SN = '/models/stylized-nature/Exports/glTF';
const N = '/models/nature';

/**
 * Preferred → fallback pairs for the locked shortlist + a few nature extras.
 * Keys are logical roles used by Vegetation / treeLod.
 */
const PREFERRED = {
  grassWideTall: `${SN}/Grass_Wide_Tall.gltf`,
  grassWideShort: `${SN}/Grass_Wide_Short.gltf`,
  grassWheat: `${SN}/Grass_Wheat.gltf`,
  flower1: `${SN}/Flower_1_Group.gltf`,
  flower2: `${SN}/Flower_2_Group.gltf`,
  flower7: `${SN}/Flower_7_Group.gltf`,
  bushLargeFlowers: `${SN}/Bush_Large_Flowers.gltf`,
  bushLong: `${SN}/Bush_Long_1.gltf`,
  tallThick1: `${SN}/TallThick_1.gltf`,
  tallThick2: `${SN}/TallThick_2.gltf`,
  birch1: `${SN}/Birch_1.gltf`,
  cherry1: `${SN}/CherryBlossom_1.gltf`,
  giantPine1: `${SN}/GiantPine_1.gltf`,
  plant5: `${SN}/Plant_5.gltf`,
  rockBig1: `${SN}/Rock_Big_1.gltf`
};

const FALLBACK = {
  grassWideTall: `${N}/Grass_Common_Tall.gltf`,
  grassWideShort: `${N}/Grass_Common_Short.gltf`,
  grassWheat: `${N}/Grass_Wispy_Tall.gltf`,
  flower1: `${N}/Flower_3_Group.gltf`,
  flower2: `${N}/Flower_4_Group.gltf`,
  flower7: `${N}/Flower_3_Group.gltf`,
  bushLargeFlowers: `${N}/Bush_Common_Flowers.gltf`,
  bushLong: `${N}/Bush_Common.gltf`,
  tallThick1: `${N}/CommonTree_1.gltf`,
  tallThick2: `${N}/CommonTree_2.gltf`,
  birch1: `${N}/CommonTree_3.gltf`,
  cherry1: `${N}/CommonTree_4.gltf`,
  giantPine1: `${N}/Pine_1.gltf`,
  plant5: `${N}/Plant_1.gltf`,
  rockBig1: `${N}/Rock_Medium_1.gltf`
};

/** Nature-only extras (always available). */
export const NATURE = {
  grassCommonTall: `${N}/Grass_Common_Tall.gltf`,
  grassWispyShort: `${N}/Grass_Wispy_Short.gltf`,
  flower3: `${N}/Flower_3_Group.gltf`,
  flower4: `${N}/Flower_4_Group.gltf`,
  clover1: `${N}/Clover_1.gltf`,
  bushCommon: `${N}/Bush_Common.gltf`,
  bushCommonFlowers: `${N}/Bush_Common_Flowers.gltf`,
  commonTree1: `${N}/CommonTree_1.gltf`,
  commonTree2: `${N}/CommonTree_2.gltf`,
  commonTree3: `${N}/CommonTree_3.gltf`,
  pine1: `${N}/Pine_1.gltf`
};

/** Set false only if MegaKit shortlist was not committed. */
let megaKitPresent = true;

export function setMegaKitPresent(v) {
  megaKitPresent = !!v;
}

export function hasMegaKit() {
  return megaKitPresent;
}

/** Resolve a shortlist role to a public URL (preferred or fallback). */
export function kitUrl(role) {
  if (megaKitPresent && PREFERRED[role]) return PREFERRED[role];
  return FALLBACK[role] || PREFERRED[role];
}

/** Human-readable fallback table for docs / hitch notes. */
export function fallbackTable() {
  return Object.keys(PREFERRED).map((role) => ({
    role,
    preferred: PREFERRED[role],
    fallback: FALLBACK[role]
  }));
}
