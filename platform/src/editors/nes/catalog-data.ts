type ChoiceCodes = Readonly<Record<string, string>>;
/** Full ROM digest → setting label → choice and its complete code group. */
type NesCatalog = Readonly<Record<string, Readonly<Record<string, ChoiceCodes>>>>;

export const inGame: NesCatalog = {
  // Castlevania
  "7a60fedbef65e6dec681525c17681e1e940f55534ff62e765d0ec15842eab422": {
    simonHealth: { "16": "0045:10", "64": "0045:40" },
  },
  // Mega Man
  af564912fc7567a2629f258c16b30990ccca5d6baa1ed84fab369c4940b599f5: {
    rockHealth: { "8": "006A:08", "28": "006A:1C" },
  },
  // Adventure Island
  "39ebbdb19995a0c4c06a8622ceb998b0aa2191489145084f9bab569301dee00d": {
    stamina: { "4": "0076:04", "15": "0076:0F" },
  },
  // Double Dragon II
  "02ade1c348b1c7db2b28882c4fba27da69966f5063d8e0f374f909f8dd202749": {
    p1Health: { "24": "041E:18", "128": "041E:80" },
  },
  // Contra
  "746d7c49b3170b49b8924655d94563120200691097ce61c562e25f8612fe9eec": {
    reserveLives: { "1": "0032:01", "8": "0032:08" },
  },
  // Contra
  "26541a5550ee22deeb3d5484e4a96130219b58cff74d068fb1eb6567fa5e5519": {
    reserveLives: { "1": "0032:01", "8": "0032:08" },
  },
  // Chip 'n Dale Rescue Rangers
  b903a9706220881b94b4d24d8fa64620332a870c1590cb827cef8e71ee05e21d: {
    healthHearts: { hearts2: "0210:08", hearts3: "0210:18" },
  },
  // Chip 'n Dale Rescue Rangers 2
  e2109968b3d96206db95a4521202415f23e03e81aa70d1844fd3639efce4e503: {
    healthHearts: { "1": "03D4:01", "3": "03D4:03" },
  },
  // Super Mario Bros.
  f61548fdf1670cffefcc4f0b7bdcdd9eaba0c226e3b74f8666071496988248de: {
    marioSize: { small: "0754:01", large: "0754:00" },
  },
  // Kirby's Adventure
  b0d74f4270ad5855f10224c460956f6dfe41d6673a38262ad0d37aa9ce103dd5: {
    reserveLives: { "3": "0599:03", "9": "0599:09" },
  },
  // Life Force
  a606c6c4c6d81b72ee783c5ad9b91cb8e1d09206c4ad2ba881698fa15fa3af57: {
    reserveLives: { "1": "0034:01", "6": "0034:06" },
  },
  // Punch-Out!!
  e0122febc87b0b0b4450ec52283fbc70ecac32fa3641740eb4b8b629003735d9: {
    macHealth: { "24": "0391:18", "96": "0391:60" },
  },
  // Blaster Master
  ad2d8c27087868631d1255a96604b3cfd82a17aca027537dc1d272db2e1d4467: {
    tankPower: { "24": "040D:18", "255": "040D:FF" },
  },
  // Metroid
  e6e6b7014685adae447ebb3833242815747bc1e5df83ade79f693fb67cf565b6: {
    startingEnergy: { start60: "0107:06", start80: "0107:08" },
  },
  // Dragon Warrior
  a7ecd04c70fff7ca3f0cd7e262377097305a30c9b5bfa27d7341f454e252be17: {
    walletGold: { "500": "00BC:F4+00BD:01", "1000": "00BC:E8+00BD:03" },
  },
};

export const onTitle: NesCatalog = {
  // Battle City
  f679aa637f413b5e974c7b203d238533e561d519e23068f42dd2c3e93ac534fa: {
    totalTanks: { "3": "0051:03", "8": "0051:08" },
  },
  // Super Mario Bros.
  f61548fdf1670cffefcc4f0b7bdcdd9eaba0c226e3b74f8666071496988248de: {
    marioStartingLives: { lives5: "GAVOZAZA", lives9: "AAVOZAZE" },
  },
  // Ninja Gaiden
  "07d9e57e35184667c7b89e30857a44c5c404b48332ad12e66be91100eccd4f5e": {
    ryuHealth: { "4": "0065:04", "16": "0065:10" },
  },
  // Mitsume ga Tooru
  "545f33d21ef9804b114d837455fed456fbd6652e76cb520e6458b416426db5c1": {
    sharakuHealth: { bars2: "007A:02", bars6: "007A:06" },
  },
};
