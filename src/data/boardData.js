// Cấu hình bàn cờ 40 ô theo cấu trúc Cờ Tỷ Phú cổ điển.
// Bàn cờ 3D được dựng hoàn toàn từ dữ liệu này (BoardManager + BoardView).

export const TILE_TYPES = Object.freeze({
  PROPERTY: 'property',
  STATION: 'station',
  UTILITY: 'utility',
  CHANCE: 'chance',
  COMMUNITY: 'community',
  TAX: 'tax',
  BANK: 'bank',
  JAIL: 'jail',
  START: 'start',
  REST: 'rest',
  GO_TO_JAIL: 'gotojail',
});

export const TILE_TYPE_LABELS = {
  property: 'Đất',
  station: 'Nhà ga',
  utility: 'Công ty dịch vụ',
  chance: 'Cơ hội',
  community: 'Khí vận',
  tax: 'Thuế',
  bank: 'Ngân hàng',
  jail: 'Nhà tù',
  start: 'Ô bắt đầu',
  rest: 'Ô nghỉ ngơi',
  gotojail: 'Vào tù',
};

export const COLOR_GROUPS = {
  brown: { name: 'Nâu', color: '#9B5B2E', houseCost: 50 },
  lightblue: { name: 'Xanh nhạt', color: '#5CC8F2', houseCost: 50 },
  pink: { name: 'Hồng', color: '#E557A8', houseCost: 100 },
  orange: { name: 'Cam', color: '#FF9124', houseCost: 100 },
  red: { name: 'Đỏ', color: '#EE3B3B', houseCost: 150 },
  yellow: { name: 'Vàng', color: '#FFD23F', houseCost: 150 },
  green: { name: 'Xanh lá', color: '#2DAF5A', houseCost: 200 },
  darkblue: { name: 'Xanh đậm', color: '#2457D6', houseCost: 200 },
};

export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const JAIL_POSITION = 10;
export const MAX_JAIL_TURNS = 3;
export const STATION_RENT = [25, 50, 100, 200];
export const UTILITY_MULTIPLIER = [4, 10];
export const BANK_INTEREST = { rate: 0.05, min: 20, max: 200 };

// Kích thước hình học của bàn cờ (đơn vị thế giới 3D).
export const BOARD_LAYOUT = Object.freeze({
  tileWidth: 2,
  cornerSize: 3,
  tileHeight: 0.2,
});

const P = (id, name, group, price, rent) => ({ id, name, type: TILE_TYPES.PROPERTY, group, price, rent });

export const BOARD_TILES = [
  { id: 0, name: 'Bắt đầu', type: TILE_TYPES.START, description: 'Nhận $200 mỗi lần đi qua hoặc dừng tại đây.' },
  P(1, 'Cà Mau', 'brown', 60, [2, 10, 30, 90, 160, 250]),
  { id: 2, name: 'Khí vận', type: TILE_TYPES.COMMUNITY, description: 'Rút một thẻ Khí vận.' },
  P(3, 'Bạc Liêu', 'brown', 60, [4, 20, 60, 180, 320, 450]),
  { id: 4, name: 'Thuế thu nhập', type: TILE_TYPES.TAX, amount: 200, description: 'Nộp $200 cho ngân hàng.' },
  { id: 5, name: 'Ga Sài Gòn', type: TILE_TYPES.STATION, price: 200 },
  P(6, 'Cần Thơ', 'lightblue', 100, [6, 30, 90, 270, 400, 550]),
  { id: 7, name: 'Cơ hội', type: TILE_TYPES.CHANCE, description: 'Rút một thẻ Cơ hội.' },
  P(8, 'Vĩnh Long', 'lightblue', 100, [6, 30, 90, 270, 400, 550]),
  P(9, 'Mỹ Tho', 'lightblue', 120, [8, 40, 100, 300, 450, 600]),
  { id: 10, name: 'Nhà tù', type: TILE_TYPES.JAIL, description: 'Chỉ ghé thăm. Người bị giam phải trả $50, dùng thẻ hoặc tung đôi để ra.' },
  P(11, 'Phan Thiết', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  { id: 12, name: 'Công ty Điện lực', type: TILE_TYPES.UTILITY, price: 150, utility: 'electric' },
  P(13, 'Nha Trang', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  P(14, 'Đà Lạt', 'pink', 160, [12, 60, 180, 500, 700, 900]),
  { id: 15, name: 'Ga Nha Trang', type: TILE_TYPES.STATION, price: 200 },
  P(16, 'Quy Nhơn', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  { id: 17, name: 'Khí vận', type: TILE_TYPES.COMMUNITY, description: 'Rút một thẻ Khí vận.' },
  P(18, 'Hội An', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  P(19, 'Huế', 'orange', 200, [16, 80, 220, 600, 800, 1000]),
  { id: 20, name: 'Công viên', type: TILE_TYPES.REST, description: 'Ô nghỉ ngơi. Không có gì xảy ra.' },
  P(21, 'Đà Nẵng', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  { id: 22, name: 'Cơ hội', type: TILE_TYPES.CHANCE, description: 'Rút một thẻ Cơ hội.' },
  P(23, 'Vinh', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  P(24, 'Ninh Bình', 'red', 240, [20, 100, 300, 750, 925, 1100]),
  { id: 25, name: 'Ga Đà Nẵng', type: TILE_TYPES.STATION, price: 200 },
  P(26, 'Hạ Long', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  P(27, 'Hải Phòng', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  { id: 28, name: 'Công ty Cấp nước', type: TILE_TYPES.UTILITY, price: 150, utility: 'water' },
  P(29, 'Sa Pa', 'yellow', 280, [24, 120, 360, 850, 1025, 1200]),
  { id: 30, name: 'Vào tù', type: TILE_TYPES.GO_TO_JAIL, description: 'Đi thẳng vào tù, không nhận $200.' },
  P(31, 'Vũng Tàu', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  P(32, 'Biên Hòa', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  { id: 33, name: 'Ngân hàng', type: TILE_TYPES.BANK, description: 'Nhận lãi 5% tiền mặt (tối thiểu $20, tối đa $200).' },
  P(34, 'Phú Quốc', 'green', 320, [28, 150, 450, 1000, 1200, 1400]),
  { id: 35, name: 'Ga Hà Nội', type: TILE_TYPES.STATION, price: 200 },
  { id: 36, name: 'Cơ hội', type: TILE_TYPES.CHANCE, description: 'Rút một thẻ Cơ hội.' },
  P(37, 'TP. Hồ Chí Minh', 'darkblue', 350, [35, 175, 500, 1100, 1300, 1500]),
  { id: 38, name: 'Thuế xa xỉ', type: TILE_TYPES.TAX, amount: 100, description: 'Nộp $100 cho ngân hàng.' },
  P(39, 'Hà Nội', 'darkblue', 400, [50, 200, 600, 1400, 1700, 2000]),
];
