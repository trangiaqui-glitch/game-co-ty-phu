// Presenter rỗng: dùng khi chạy logic game không có giao diện (kiểm thử Node).
// AnimationManager cài đặt cùng giao diện này với hoạt ảnh 3D thật.
const done = () => Promise.resolve();

export class NullPresenter {
  wait() { return done(); }
  turnStart() { return done(); }
  rollDice() { return done(); }
  movePlayer() { return done(); }
  landed() { return done(); }
  sendToJail() { return done(); }
  releaseFromJail() { return done(); }
  purchase() { return done(); }
  build() { return done(); }
  sellBuilding() { return done(); }
  mortgage() { return done(); }
  unmortgage() { return done(); }
  transferMoney() { return done(); }
  reward() { return done(); }
  showCard() { return done(); }
  bankrupt() { return done(); }
  gameOver() { return done(); }
}
