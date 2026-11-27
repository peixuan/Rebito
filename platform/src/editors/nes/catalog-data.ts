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
  // Adventure Island II
  "8359c98f279ebb9ffa2f6a584d9b13e8714f25213aa9bd177db76bd9df1e017b": {
    healthGauge: { bars4: "07D3:04", bars15: "07D3:0F" },
  },
  // Adventure Island 3
  "339c363d4d926fb0a9efe59547c417b27b0b081bbab28a36be62f8ab75552c41": {
    lives: { lives2: "0394:02", lives8: "0394:08" },
  },
  // Ninja Gaiden II - The Dark Sword of Chaos
  c37ed34f46cc443447ec52e341451fce41d44ba22a9f19b2ac37046642dd3933: {
    ryuHealth: { bars4: "0080:04", bars16: "0080:10" },
  },
  // Ninja Gaiden III - The Ancient Ship of Doom
  d24b3cd86b785b3b9c10164d6299e26a33208ab6e4bb6d989acde38dc0ab6f36: {
    ryuHealth: { bars4: "00A7:04", bars16: "00A7:10" },
  },
  // Journey to Silius
  "2f08b05e88eb3c051bc4e77004e6cdde1db1ea79afa457fb2ca7571e341e1732": {
    heroHealth: { lowHealth: "00B0:03", highHealth: "00B0:0F" },
  },
  // Duck Tales
  c7419d5c1b4a78ff427e8d7beac13f9b006f813aec56092a92485e1185283367: {
    remainingLives: { lives2: "0219:02", lives8: "0219:08" },
  },
  // Super Mario Bros. 3
  "6ea0777ca520ba7ad7b0ea0f6452140d59aa0b1dffe5045cb1e8020dde10c267": {
    marioLives: { lives3: "0736:03", lives8: "0736:08" },
  },
  // Kirby's Adventure
  "4e1942d306b7dc86f5390c9bf1e484837928c533ca687d69b49724596e0506e2": {
    kirbyLives: { lives2: "0599:02", lives8: "0599:08" },
  },
  // Gradius
  "8d53f30b5198f6630edb0192b4fc8f7aea754cb95d42b979a785cd5647ab52b7": {
    reserveShips: { planes1: "0020:01", planes6: "0020:06" },
  },
  // Legend of Zelda, The
  "826d578a7ef3e28a3513ad0e77416e7f5fabd2de5d96c32d77f595add2c25f44": {
    rupees: { count16: "066D:10", count80: "066D:50" },
  },
  // Duck Tales 2
  "6400b8dedbb6273f5ea01b68c61453f7cf5cab64ea2a0f57d4d31dd4b983187b": {
    remainingLives: { lives2: "00CE:02", lives8: "00CE:08" },
  },
  // Kid Icarus
  e65129430c559fb7950ed2893c189ea923f238edf307892058cd5e7205be47be: {
    peteHealth: { lowHealth: "00A6:05", highHealth: "00A6:18" },
  },
  // Crystalis
  "14ba6d1d117e4560bbd31635d70cee2d704d4c596ada83bde07e525907ad357e": {
    levelAndStats: { levels2: "0421:02", levels8: "0421:08" },
  },
  // Gun Nac
  ea8cad6c8d7679afa9069037a9166690a0d17ec148cded02efd47e4815acd0cb: {
    bombsF: { count1: "018F:01", count7: "018F:07" },
  },
  // Final Fantasy
  d360beeee19a69d1c92d02292167c57f2d3ca8405b79101fc8c2f39dea549667: {
    partyGold: { "500 G": "601C:F4+601D:01", "1200 G": "601C:B0+601D:04" },
  },
  // Bomberman
  "8daf7eeddc2fad75ecfa8d3dac494fd8442528e707ee4b49e95bb4f082094cc2": {
    stageCountdown: { "64": "0093:40", "133": "0093:85" },
  },
  // City Connection
  "221c4ad082a56639524090efee23b12f300e26182391e9e29a4e1a0a9d25b22a": {
    carsLeft: { vehicles1: "00A2:01", vehicles6: "00A2:06" },
  },
  // Fire Emblem - Ankoku Ryuu to Hikari no Tsurugi
  "2f12b3097d041e1742634ff9affd7fc33f518f9d26b80ad5d78a62a740b8241a": {
    marthHealth: { "8/24 HP": "6A93:08+6A94:18", "16/24 HP": "6A93:10+6A94:18" },
  },
  // Dragon Warrior III
  "7c965051ffa461969df7d7b56d6ce03a8c85eb485ebdfa65a716269087dbf969": {
    partyGold: { gold25: "07BC:19+07BD:00+07BE:00", gold125: "07BC:7D+07BD:00+07BE:00" },
  },
  // Dragon Warrior II
  "114f70f42e55a39e730b201c7876d2e97fa99611200ae6a812659f3a0efce49e": {
    partyGold: { gold25: "0624:19+0625:00", gold125: "0624:7D+0625:00" },
  },
  f5f9704507473659bd3a570fe572c5a21ced0649af1d2a606bf61aced4c32607: {
    p1Health: { lowHealth: "03B4:10", highHealth: "03B4:50" },
  },
  // Nekketsu Kakutou Densetsu
  d05987fcf1678ea30b88fc1982abf39d3e4c444c3b0bbc302981e26d2e78c755: {
    teamHealth: { low: "04C3:18+04C2:18", high: "04C3:A0+04C2:A0" },
  },
  // Darkwing Duck
  b7fff97f34d7142765685c6505ad54285cfd7e847e6943bc53e432c4f25fa49c: {
    characterHealth: { lowHealth: "05B6:11+05B4:10", highHealth: "05B6:81+05B4:80" },
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
  // Jackie Chan's Action Kung Fu
  c80aa46a75492037212c8dbbbd1787195bcf2f3082491515057f216f4f0092df: {
    jackieHealth: { points2: "0702:02", points6: "0702:06" },
  },
  // Bubble Bobble
  fc521e891d074369d67579fd56617460b9c9949dec67cc4a37d46b4e4bb09d29: {
    reserveLives: { display1: "002E:02", display7: "002E:08" },
  },
  // Mitsume ga Tooru
  "545f33d21ef9804b114d837455fed456fbd6652e76cb520e6458b416426db5c1": {
    sharakuHealth: { bars2: "007A:02", bars6: "007A:06" },
  },
  // Don Doko Don
  "0ee152d2d754bfe2b381fa8e14252cee4b5f5388daabbe0c05ebde3bae75ee38": {
    reserveLives: { display1: "0060:02", display7: "0060:08" },
  },
  // Kickle Cubicle
  "3c01f1eb1d9adedabb1082b16bef9d987f629741a4146d5a7617d9aea8f391a0": {
    lifeIcons: { less: "00B6:02", more: "00B6:08" },
  },
  // Super Contra
  "95328473d961b1c897683c5ba9b1a4322959637bb3494e9f7012daca958a875e": {
    reserveLives: { less: "0053:01", more: "0053:08" },
  },
  // Galaga - Demons of Death
  ca9c86ea827d4bf16eb974123827b272d6cb57c97b3f4aef5b23f6308d53ebee: {
    p1Aircraft: { totalShips1: "0485:01+0487:01", totalShips6: "0485:06+0487:06" },
  },
  // Pac-Man
  "4c6217b1a55586aecaf106059098447f444a7623000556fced05f9ae3ba1dea8": {
    extraLives: { low: "0067:02", high: "0067:05" },
  },
  // Bubble Bobble Part 2
  "4ca9b852ca31435cb3c22501dc73013dcbee1681846cecbc8f3e0fc743690a60": {
    remainingLives: { lives2: "0479:02", lives8: "0479:08" },
  },
  // Donkey Kong Classics
  "1136453809e5681318b8115ad23b7f769a7ada1f8648090fc006c39cfe80da61": {
    donkeyKongLives: { lives1: "PETANA", lives6: "TETANA" },
  },
  // Ivan Ironman Stewart's Super Off-Road
  "9df35978b97053c8209b5933d37a6879206cd0106b68b60b4f104efe755a117d": {
    p1Cars: { vehicles2: "075D:02", vehicles3: "075D:03" },
  },
  // Donkey Kong
  "6060e087239ed301916e59a56b3756c25eb5552c4b8bb76a9b22fb1906383803": {
    startLives: { lives1: "0055:01", lives6: "0055:06" },
  },
  // Donkey Kong Jr.
  c25a69a55cce7d6a0f7f6c13bfab5877ee478c5b782e3c0dffba90cee722a176: {
    startLives: { lives1: "004C:01", lives6: "004C:06" },
  },
  // Donkey Kong 3
  e634f845dea830c63984effc320b9bc335e9cea2757b2ec8f70727b0d94103b3: {
    startLives: { lives1: "0090:01", lives6: "0090:06" },
  },
  // Balloon Fight
  "7df17a818ee64910f5da7eb9d3e0b86f848628f032071e63424eeab62fb99cd4": {
    extraLives: { icons1: "0041:01", icons5: "0041:05" },
  },
  // Arkanoid
  "4b6453aff34c2b2834b6a1fad061ba4aad4f674d504a97c07e78a370c434bc12": {
    sparePaddles: { noPaddles: "000D:01", paddles5: "000D:06" },
  },
  // Contra Force
  d8fb504e56490420c1b98fbf19b741e159a9a0a6fad4cb1c9459413a482dc1e8: {
    beansLives: { reserveLives1: "00B6:02", reserveLives7: "00B6:08" },
  },
  // Circus Charlie
  "63d4eff21f6c3c7df0f702cf8149e1761742f7d2dd9b19df66b43f1554e81aab": {
    extraLives: { icons2: "0060:02", icons6: "0060:06" },
  },
  f0bbb29e5947b5198dc759fc2bf213df50eba693313dc110e9a817bb73127a9a: {
    remainingLives: { lives2: "002B:02", lives8: "002B:08" },
  },
  "3d4a1de8f3c9714fe73fd6ffe92e7c67d2275a9ce7c1c0124d7a6c2b9b9b2e24": {
    firstShipLives: { "02": "0056:02", "08": "0056:08" },
  },
  "902914c1489a143b54743da230e0ff023a2df7fd18025575d4130185e4f53dfe": {
    reserveAircraft: { planes2: "0432:02", planes6: "0432:06" },
  },
  "97470309393c1d921e45b0251fb78c7f21cd8ed9e2a11df7e0fae2cf7e197890": {
    heroLives: { lives2: "0070:02", lives8: "0070:08" },
  },
  // Rush'n Attack
  "82760ba9d2552ea50f428f73ba08fd91644a098f4c59911216fb5746e8e34a50": {
    reserveLives: { low: "0022:02", high: "0022:08" },
  },
  // B-Wings
  "40ab99e6c8aec2741503b7e69d2597fbff518ece062f78a1b028b5fac3b6b9ae": {
    shipLives: { lives2: "053E:02", lives8: "053E:08" },
  },
  "948d9d72c912945d9a5e7ecd36cd765ca5a3535b091d8aa12a2b17ec890d118b": {
    spareShips: { "02": "0056:02", "08": "0056:08" },
  },
  "66c1d43238b2d868ae4ac3f31d3109aa909740987f47563f8d8bd4064a02c3e8": {
    seiyaHealth: { longLife: "05CF:08", shortLife: "05CF:20" },
  },
  "5ed66bb855d9ba84b4bd30c41c6a75ac9f1a68482d9471b8428905c2ce295235": {
    startingP1Lives: { low: "AAISPL", high: "IAISPL" },
  },
  // Ghosts 'N Goblins
  fbd02d2c92b623e23b08cd56c4a1960cbe2d3a24314a7a086a9e5688e1decd08: {
    startingLives: { lives1: "PAEKPTLA", lives6: "TAEKPTLA" },
  },
  // Kung-Fu Heroes
  "58b49cf83a18bc563ed50b06339d17a6f6768dd555860d6f4f68a2b7a71af9a6": {
    reserveLives: { "02": "04D0:02", "08": "04D0:08" },
  },
  // Super Mario Bros 2
  "9f73e5a91857ff58024769fb299bf8c2404dd9b7e4e0cb26cb7f346df05409da": {
    extraLives: { reserveLives1: "04ED:02", reserveLives7: "04ED:08" },
  },
  // Dig Dug II
  "0e13c03fa6370f898691b33f08309cbc0efa7152b634ec18d210c37143cbdeca": {
    reserveCharacters: { low: "02C9:02", high: "02C9:06" },
  },
};
