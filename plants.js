/* 保龄球植物；传送带补给与滚动参数在 game.js 中。 */
window.PLANT_DEFINITIONS = {
  /* 景甜向日葵定时结出孙宇晨坚果，点击后直接拿在手上，放下后滚动。 */
  nutflower: {
    name: '景甜向日葵', englishName: 'Jing Tian Sunflower', health: 300,
    sprite: 'justin-sunflower', glowSprite: 'justin-sunflower-glow', width: 73, height: 74,
    packet: 'assets/packet-justin-sunflower.png', nutType: 'wallnut', firstNut: 10, nutInterval: 30
  },
  /* 每喂一颗普通坚果，等待转化后产出一颗红色爆炸坚果。 */
  zengflower: {
    name: '曾颖向日葵', englishName: 'Zeng Ying Sunflower', health: 300,
    sprite: 'zeng-ying-sunflower', glowSprite: 'zeng-ying-sunflower-glow', width: 73, height: 74,
    packet: 'assets/packet-zeng-ying-sunflower.png', nutType: 'boomnut', feedType: 'wallnut', processTime: 10
  },
  wallnut: {
    name: '孙宇晨坚果', englishName: 'Justin Nut', sprite: 'justin-nut', width: 74, height: 82,
    packet: 'assets/packet-justin-nut.png', idleMotion: { period: 2.4, rotation: 0.025, breathe: 0.018 }
  },
  /* 爆炸坚果撞到僵尸后炸掉相邻三行、前后约一格范围内的僵尸。 */
  boomnut: {
    name: '爆炸坚果', sprite: 'justin-nut-boom', packet: 'assets/packet-boom-nut.png', width: 74, height: 82, blastRadius: 90
  }
};
