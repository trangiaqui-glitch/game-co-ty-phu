// Thẻ Cơ hội và Khí vận. Mỗi thẻ có một action được GameManager thực thi.
// action.type: money | moveTo | moveBack | nearest | jail | jailCard | repairs | payEach | collectEach

export const CHANCE_CARDS = [
  { id: 'ch-go', text: 'Tiến thẳng tới ô Bắt đầu. Nhận $200.', action: { type: 'moveTo', tile: 0 } },
  { id: 'ch-ninhbinh', text: 'Du lịch Ninh Bình. Nếu đi qua ô Bắt đầu, nhận $200.', action: { type: 'moveTo', tile: 24 } },
  { id: 'ch-phanthiet', text: 'Công tác Phan Thiết. Nếu đi qua ô Bắt đầu, nhận $200.', action: { type: 'moveTo', tile: 11 } },
  { id: 'ch-utility', text: 'Đi tới công ty dịch vụ gần nhất. Nếu đã có chủ, trả gấp 10 lần số xúc xắc.', action: { type: 'nearest', kind: 'utility' } },
  { id: 'ch-station1', text: 'Đi tới nhà ga gần nhất. Nếu đã có chủ, trả gấp đôi tiền thuê.', action: { type: 'nearest', kind: 'station' } },
  { id: 'ch-station2', text: 'Đi tới nhà ga gần nhất. Nếu đã có chủ, trả gấp đôi tiền thuê.', action: { type: 'nearest', kind: 'station' } },
  { id: 'ch-dividend', text: 'Ngân hàng trả cổ tức cho bạn $50.', action: { type: 'money', amount: 50 } },
  { id: 'ch-jailfree', text: 'Thẻ RA TÙ MIỄN PHÍ. Giữ lại để dùng khi cần.', action: { type: 'jailCard' } },
  { id: 'ch-back3', text: 'Lùi lại 3 ô.', action: { type: 'moveBack', steps: 3 } },
  { id: 'ch-jail', text: 'Vào tù ngay! Không đi qua ô Bắt đầu, không nhận $200.', action: { type: 'jail' } },
  { id: 'ch-repairs', text: 'Bảo trì bất động sản: trả $25 mỗi nhà, $100 mỗi khách sạn.', action: { type: 'repairs', house: 25, hotel: 100 } },
  { id: 'ch-speeding', text: 'Vi phạm tốc độ. Nộp phạt $15.', action: { type: 'money', amount: -15 } },
  { id: 'ch-saigon', text: 'Đi tàu tới Ga Sài Gòn. Nếu đi qua ô Bắt đầu, nhận $200.', action: { type: 'moveTo', tile: 5 } },
  { id: 'ch-hanoi', text: 'Dạo phố Hà Nội.', action: { type: 'moveTo', tile: 39 } },
  { id: 'ch-chairman', text: 'Bạn được bầu làm chủ tịch hội đồng. Trả mỗi người chơi $50.', action: { type: 'payEach', amount: 50 } },
  { id: 'ch-loan', text: 'Khoản vay xây dựng đáo hạn. Nhận $150.', action: { type: 'money', amount: 150 } },
];

export const COMMUNITY_CARDS = [
  { id: 'cc-go', text: 'Tiến thẳng tới ô Bắt đầu. Nhận $200.', action: { type: 'moveTo', tile: 0 } },
  { id: 'cc-bankerror', text: 'Ngân hàng tính nhầm có lợi cho bạn. Nhận $200.', action: { type: 'money', amount: 200 } },
  { id: 'cc-doctor', text: 'Phí khám bệnh. Trả $50.', action: { type: 'money', amount: -50 } },
  { id: 'cc-stock', text: 'Bán cổ phiếu có lãi. Nhận $50.', action: { type: 'money', amount: 50 } },
  { id: 'cc-jailfree', text: 'Thẻ RA TÙ MIỄN PHÍ. Giữ lại để dùng khi cần.', action: { type: 'jailCard' } },
  { id: 'cc-jail', text: 'Vào tù ngay! Không đi qua ô Bắt đầu, không nhận $200.', action: { type: 'jail' } },
  { id: 'cc-holiday', text: 'Quỹ du lịch đáo hạn. Nhận $100.', action: { type: 'money', amount: 100 } },
  { id: 'cc-refund', text: 'Hoàn thuế thu nhập. Nhận $20.', action: { type: 'money', amount: 20 } },
  { id: 'cc-birthday', text: 'Sinh nhật của bạn! Mỗi người chơi tặng bạn $10.', action: { type: 'collectEach', amount: 10 } },
  { id: 'cc-insurance', text: 'Bảo hiểm nhân thọ đáo hạn. Nhận $100.', action: { type: 'money', amount: 100 } },
  { id: 'cc-hospital', text: 'Viện phí. Trả $100.', action: { type: 'money', amount: -100 } },
  { id: 'cc-school', text: 'Học phí. Trả $50.', action: { type: 'money', amount: -50 } },
  { id: 'cc-consult', text: 'Phí tư vấn. Nhận $25.', action: { type: 'money', amount: 25 } },
  { id: 'cc-street', text: 'Sửa đường phố: trả $40 mỗi nhà, $115 mỗi khách sạn.', action: { type: 'repairs', house: 40, hotel: 115 } },
  { id: 'cc-beauty', text: 'Giải nhì cuộc thi sắc đẹp. Nhận $10.', action: { type: 'money', amount: 10 } },
  { id: 'cc-inherit', text: 'Nhận thừa kế $100.', action: { type: 'money', amount: 100 } },
];

export const DECK_TITLES = { chance: 'CƠ HỘI', community: 'KHÍ VẬN' };
