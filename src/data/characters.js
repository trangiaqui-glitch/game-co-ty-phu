// Thông tin hiển thị của nhân vật (tên, màu nhận diện, mô tả).
// Đường dẫn GLB, scale, hướng và alias animation nằm trong src/data/characterConfig.js.
// `look` chỉ dùng để dựng MÔ HÌNH TẠM khi thiếu GLB (luôn được thông báo rõ cho người chơi).

export const CHARACTERS = [
  {
    id: 'businessman',
    name: 'Anh Minh',
    title: 'Doanh nhân',
    description: 'Doanh nhân mặc vest, luôn mang cặp tài liệu.',
    color: '#2F6BFF',
    look: {
      skin: '#F2C09A', hair: '#15110F', hairStyle: 'slick', sleeve: 'short',
      top: '#7DB9E8', bottom: '#17171C', shoes: '#0E0E10',
      extras: ['tie', 'collar'], tieColor: '#15151A', accessory: 'briefcase',
    },
  },
  {
    id: 'businesswoman',
    name: 'Chị Lan',
    title: 'Nữ doanh nhân',
    description: 'Nữ doanh nhân thanh lịch với váy dạ hội và túi xách.',
    color: '#E0399A',
    look: {
      skin: '#F9D2B5', hair: '#5A2E1A', hairStyle: 'long', sleeve: 'short',
      top: '#B0217A', bottom: '#B0217A', shoes: '#2B0F22', skirt: true,
      extras: ['necklace'], accessory: 'handbag', lipColor: '#D6336C',
    },
  },
  {
    id: 'explorer',
    name: 'Tuấn',
    title: 'Nhà thám hiểm',
    description: 'Nhà thám hiểm với mũ rộng vành và ba lô to.',
    color: '#2EAD5B',
    look: {
      skin: '#E8B48A', hair: '#3B2416', hairStyle: 'short', hat: 'safari', sleeve: 'short',
      top: '#C9A86B', bottom: '#7A5A35', shoes: '#4A3020',
      extras: ['scarf'], scarfColor: '#E74C3C', accessory: 'backpack',
    },
  },
  {
    id: 'engineer',
    name: 'Kỹ sư Hùng',
    title: 'Kỹ sư xây dựng',
    description: 'Kỹ sư công trình với mũ bảo hộ và cờ lê.',
    color: '#F39C12',
    look: {
      skin: '#F2C29C', hair: '#1E1E1E', hairStyle: 'short', hat: 'hardhat', sleeve: 'long',
      top: '#FF7A1A', bottom: '#2F5D9E', shoes: '#3A2A1A',
      extras: ['vest'], accessory: 'wrench',
    },
  },
  {
    id: 'chef',
    name: 'Bếp trưởng Mai',
    title: 'Đầu bếp',
    description: 'Đầu bếp vui vẻ với mũ cao và tạp dề trắng.',
    color: '#E74C3C',
    look: {
      skin: '#F6CFAE', hair: '#3A2318', hairStyle: 'bun', hat: 'chef', sleeve: 'long',
      top: '#FFFFFF', bottom: '#2B2B2B', shoes: '#1C1C1C',
      extras: ['apron', 'scarf'], scarfColor: '#E74C3C', accessory: 'spoon',
    },
  },
  {
    id: 'astronaut',
    name: 'Phi hành gia Nam',
    title: 'Phi hành gia',
    description: 'Phi hành gia mặc đồ bảo hộ trắng, đội mũ kính.',
    color: '#8E44AD',
    look: {
      skin: '#F4C7A1', hair: '#24160F', hairStyle: 'short', hat: 'helmet', sleeve: 'long',
      top: '#F4F6FA', bottom: '#E3E7EF', shoes: '#6C7A89',
      extras: ['suitBadge'], accessory: 'jetpack',
    },
  },
];

export const PLAYER_COLORS = ['#2F6BFF', '#E0399A', '#2EAD5B', '#F39C12'];

export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}
